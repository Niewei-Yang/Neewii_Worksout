import MapboxLanguage from '@mapbox/mapbox-gl-language';
import React, {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
} from 'react';
import Map, {
  Layer,
  Source,
  FullscreenControl,
  NavigationControl,
  MapRef,
} from 'react-map-gl';
import { MapInstance } from 'react-map-gl/src/types/lib';
import useActivities from '@/hooks/useActivities';
import {
  IS_CHINESE,
  ROAD_LABEL_DISPLAY,
  MAPBOX_TOKEN,
  MAP_TILE_STYLE_DARK,
  PROVINCE_FILL_COLOR,
  COUNTRY_FILL_COLOR,
  USE_DASH_LINE,
  LINE_OPACITY,
  MAP_HEIGHT,
  PRIVACY_MODE,
  LIGHTS_ON,
  MAP_TILE_ACCESS_TOKEN,
} from '@/utils/const';
import {
  Coordinate,
  IViewState,
  geoJsonForMap,
  getMapStyle,
  isTouchDevice,
} from '@/utils/utils';
import { RouteAnimator } from '@/utils/routeAnimation';
import RunMarker from './RunMarker';
import RunMapButtons from './RunMapButtons';
import styles from './style.module.css';
import { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';
import './mapbox.css';
import LightsControl from '@/components/RunMap/LightsControl';
import MapDimensionControl from '@/components/RunMap/MapDimensionControl';
import MapStyleControl from '@/components/RunMap/MapStyleControl';
import { useMapTheme, useThemeChangeCounter } from '@/hooks/useTheme';

interface IRunMapProps {
  title: string;
  viewState: IViewState;
  setViewState: (_viewState: IViewState) => void;
  changeYear: (_year: string) => void;
  geoData: FeatureCollection<RPGeometry>;
  thisYear: string;
  animationTrigger?: number; // Optional trigger to force animation replay
}

const LIGHTS_OFF_BACKGROUND_COLOR = '#2a2a2a';
const GLOBE_DARK_BACKGROUND_COLOR = '#121316';
const MAPBOX_TERRAIN_SOURCE_ID = 'mapbox-terrain-dem';
const MAPBOX_TERRAIN_SOURCE_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';
const MAPBOX_TERRAIN_HILLSHADE_LAYER_ID = 'mapbox-terrain-hillshade';
const MAPBOX_TERRAIN_EXAGGERATION = 1;
const MAPBOX_TERRAIN_PITCH = 0;
const MAPBOX_TERRAIN_BEARING = 0;

type TerrainCapableMap = MapInstance & {
  getSource?: (_id: string) => unknown;
  getLayer?: (_id: string) => unknown;
  addSource?: (
    _id: string,
    _source: {
      type: 'raster-dem';
      url: string;
      tileSize: number;
      maxzoom: number;
    }
  ) => void;
  addLayer?: (_layer: Record<string, unknown>, _beforeId?: string) => void;
  removeLayer?: (_id: string) => void;
  removeSource?: (_id: string) => void;
  setTerrain?: (
    _terrain: null | { source: string; exaggeration: number }
  ) => void;
  getPitch?: () => number;
  setPitch?: (_pitch: number) => void;
  getBearing?: () => number;
  setBearing?: (_bearing: number) => void;
};

const applyMapProjection = (
  map: MapInstance,
  lights: boolean,
  terrainEnabled = false
) => {
  try {
    map.setProjection(terrainEnabled ? 'mercator' : 'globe');
    map.setFog({
      color: lights ? '#1e2128' : LIGHTS_OFF_BACKGROUND_COLOR,
      'high-color': lights ? '#2b303a' : LIGHTS_OFF_BACKGROUND_COLOR,
      'space-color': GLOBE_DARK_BACKGROUND_COLOR,
      'horizon-blend': 0.02,
      'star-intensity': 0,
    });
  } catch (error) {
    console.warn('Error applying map projection:', error);
  }
};

const applyMapboxTerrain = (map: MapInstance, enabled: boolean) => {
  const terrainMap = map as TerrainCapableMap;

  try {
    if (!enabled) {
      terrainMap.setTerrain?.(null);
      if (terrainMap.getLayer?.(MAPBOX_TERRAIN_HILLSHADE_LAYER_ID)) {
        terrainMap.removeLayer?.(MAPBOX_TERRAIN_HILLSHADE_LAYER_ID);
      }
      if (terrainMap.getSource?.(MAPBOX_TERRAIN_SOURCE_ID)) {
        terrainMap.removeSource?.(MAPBOX_TERRAIN_SOURCE_ID);
      }
      return;
    }

    if (!terrainMap.getSource?.(MAPBOX_TERRAIN_SOURCE_ID)) {
      terrainMap.addSource?.(MAPBOX_TERRAIN_SOURCE_ID, {
        type: 'raster-dem',
        url: MAPBOX_TERRAIN_SOURCE_URL,
        tileSize: 512,
        maxzoom: 14,
      });
    }

    if (!terrainMap.getLayer?.(MAPBOX_TERRAIN_HILLSHADE_LAYER_ID)) {
      const firstSymbolLayer = terrainMap
        .getStyle()
        .layers.find((layer: { type?: string }) => layer.type === 'symbol')?.id;

      terrainMap.addLayer?.(
        {
          id: MAPBOX_TERRAIN_HILLSHADE_LAYER_ID,
          type: 'hillshade',
          source: MAPBOX_TERRAIN_SOURCE_ID,
          paint: {
            'hillshade-exaggeration': 0.35,
            'hillshade-shadow-color': '#1f2937',
            'hillshade-highlight-color': '#d6d3c8',
            'hillshade-accent-color': '#64748b',
          },
        },
        firstSymbolLayer
      );
    }

    terrainMap.setTerrain?.({
      source: MAPBOX_TERRAIN_SOURCE_ID,
      exaggeration: MAPBOX_TERRAIN_EXAGGERATION,
    });

    if ((terrainMap.getPitch?.() ?? 0) < MAPBOX_TERRAIN_PITCH) {
      terrainMap.setPitch?.(MAPBOX_TERRAIN_PITCH);
    }
    if (terrainMap.getBearing?.() === 0) {
      terrainMap.setBearing?.(MAPBOX_TERRAIN_BEARING);
    }
  } catch (error) {
    console.warn('Error applying mapbox terrain:', error);
  }
};

const RunMap = ({
  title,
  viewState,
  setViewState,
  changeYear,
  geoData,
  thisYear,
  animationTrigger,
}: IRunMapProps) => {
  const { countries, provinces } = useActivities();
  const mapRef = useRef<MapRef>(null);
  const [lights, setLights] = useState(PRIVACY_MODE ? false : LIGHTS_ON);
  // layers that should remain visible when lights are off
  const keepWhenLightsOff = [
    'runs2-casing',
    'runs2',
    'display-only-routes-casing',
    'display-only-routes',
    'animated-run-casing',
    'animated-run',
  ];
  const [mapGeoData, setMapGeoData] =
    useState<FeatureCollection<RPGeometry> | null>(null);
  const [isLoadingMapData, setIsLoadingMapData] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const tileErrorCountRef = useRef(0);
  const hasInitializedMapStyleRef = useRef(false);
  const backgroundLayerDefaultsRef = useRef<Record<string, unknown>>({});
  const [localViewState, setLocalViewState] = useState<IViewState>(viewState);
  const initGeoDataLength = geoData.features.length;
  const isBigMap = (localViewState.zoom ?? 0) <= 3;

  useEffect(() => {
    setLocalViewState(viewState);
  }, [viewState]);

  // Use the map theme hook to get the current map theme
  const currentMapTheme = useMapTheme();
  const [mapStyleVariant, setMapStyleVariant] = useState<
    'original' | 'satellite'
  >('original');
  const [is3dMapEnabled, setIs3dMapEnabled] = useState(false);
  const isSatelliteMap = mapStyleVariant === 'satellite';
  const handleMapStyleVariantChange = useCallback(
    (variant: 'original' | 'satellite') => {
      setMapStyleVariant(variant);
      setIs3dMapEnabled(false);
    },
    []
  );
  // Listen for theme changes to update single run color
  const themeChangeCounter = useThemeChangeCounter();

  // Use the selected activity color for the animated overlay as well.
  const singleRunColor = useMemo(() => {
    const color = geoData.features[0]?.properties?.color;
    return typeof color === 'string' ? color : '#f97316';
  }, [geoData, themeChangeCounter]);

  // Generate map style based on current theme
  const mapStyle = useMemo(() => {
    const isDarkTheme = currentMapTheme === MAP_TILE_STYLE_DARK;

    if (mapStyleVariant === 'satellite') {
      return getMapStyle(
        'mapbox',
        'satellite-streets-v12',
        MAP_TILE_ACCESS_TOKEN
      );
    }

    return getMapStyle(
      'mapbox',
      isDarkTheme ? 'dark-v11' : 'light-v11',
      MAP_TILE_ACCESS_TOKEN
    );
  }, [currentMapTheme, mapStyleVariant]);

  const handleMapError = useCallback((error: unknown) => {
    console.warn('Map reported a non-fatal loading error:', error);
  }, []);

  const handleTileError = useCallback(() => {
    tileErrorCountRef.current += 1;
    if (tileErrorCountRef.current >= 10) {
      setMapError('Some map tiles are unavailable. Try refreshing the page.');
    }
  }, []);

  // Update map when theme changes
  useEffect(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();

      if (!hasInitializedMapStyleRef.current) {
        hasInitializedMapStyleRef.current = true;
        applyMapProjection(map, lights, is3dMapEnabled);
        applyMapboxTerrain(map, is3dMapEnabled);
        return;
      }

      // Save current map state before changing style
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      const currentBearing = map.getBearing();
      const currentPitch = map.getPitch();

      // Apply new style
      backgroundLayerDefaultsRef.current = {};
      map.setStyle(mapStyle);

      // Create a stable handler for style.load to ensure proper cleanup
      const handleStyleLoad = () => {
        // Add a small delay to ensure style is fully loaded
        setTimeout(() => {
          try {
            // Restore map view state
            map.setCenter(currentCenter);
            map.setZoom(currentZoom);
            map.setBearing(currentBearing);
            map.setPitch(currentPitch);
            applyMapProjection(map, lights, is3dMapEnabled);

            // Reapply layer visibility settings with current lights state
            switchLayerVisibility(map, lights);
            applyMapboxTerrain(map, is3dMapEnabled);
          } catch (error) {
            console.warn('Error applying map style changes:', error);
          }
        }, 100);
      };

      // Use once to automatically remove the listener after it fires
      map.once('style.load', handleStyleLoad);
    }
  }, [mapStyle]); // Keep style changes separate from terrain toggles.

  // animation state (single run only)
  const [animatedPoints, setAnimatedPoints] = useState<Coordinate[]>([]);
  const routeAnimatorRef = useRef<RouteAnimator | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);

  // Memoize filter arrays to prevent recreating them on every render
  const filterProvinces = useMemo(() => {
    const filtered = provinces.slice();
    filtered.unshift('in', 'name');
    return filtered;
  }, [provinces]);

  const filterCountries = useMemo(() => {
    const filtered = countries.slice();
    filtered.unshift('in', 'name');
    return filtered;
  }, [countries]);

  /**
   * Toggle visibility of map layers based on lights setting
   * @param map - The Mapbox map instance
   * @param lights - Whether lights are on or off
   */
  function syncBackgroundLayerDefaults(map: MapInstance) {
    const styleJson = map.getStyle();
    styleJson.layers.forEach(
      (it: {
        id: string;
        type?: string;
        paint?: { 'background-color'?: unknown };
      }) => {
        if (
          it.type === 'background' &&
          !(it.id in backgroundLayerDefaultsRef.current)
        ) {
          backgroundLayerDefaultsRef.current[it.id] =
            it.paint?.['background-color'] ?? GLOBE_DARK_BACKGROUND_COLOR;
        }
      }
    );
  }

  function switchLayerVisibility(map: MapInstance, lights: boolean) {
    const styleJson = map.getStyle();
    syncBackgroundLayerDefaults(map);
    styleJson.layers.forEach((it: { id: string; type?: string }) => {
      const keepLayerVisibleWhenLightsOff =
        keepWhenLightsOff.includes(it.id) || it.type === 'background';

      if (it.type === 'background') {
        const backgroundColor = lights
          ? backgroundLayerDefaultsRef.current[it.id]
          : LIGHTS_OFF_BACKGROUND_COLOR;

        if (backgroundColor !== undefined) {
          map.setPaintProperty(it.id, 'background-color', backgroundColor);
        }
      }

      if (!keepLayerVisibleWhenLightsOff) {
        if (lights) map.setLayoutProperty(it.id, 'visibility', 'visible');
        else map.setLayoutProperty(it.id, 'visibility', 'none');
      }
    });
  }

  // Apply layer visibility when lights setting changes
  useEffect(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      // Add a small delay to ensure map is ready
      setTimeout(() => {
        try {
          applyMapProjection(map, lights, is3dMapEnabled);
          switchLayerVisibility(map, lights);
          applyMapboxTerrain(map, is3dMapEnabled);
        } catch (error) {
          console.warn('Error switching layer visibility:', error);
        }
      }, 50);
    }
  }, [lights, is3dMapEnabled]);

  const mapRefCallback = useCallback(
    (ref: MapRef) => {
      if (ref !== null) {
        const map = ref.getMap();
        if (map && IS_CHINESE) {
          map.addControl(new MapboxLanguage({ defaultLanguage: 'zh-Hans' }));
        }
        // all style resources have been downloaded
        // and the first visually complete rendering of the base style has occurred.
        // it's odd. when use style other than mapbox, the style.load event is not triggered.Add commentMore actions
        // so I use data event instead of style.load event and make sure we handle it only once.
        map.on('data', (event) => {
          if (event.dataType !== 'style' || mapRef.current) {
            return;
          }
          if (!ROAD_LABEL_DISPLAY) {
            const layers = map.getStyle().layers;
            const labelLayerNames = layers
              .filter(
                (layer: any) =>
                  (layer.type === 'symbol' || layer.type === 'composite') &&
                  layer.layout.text_field !== null
              )
              .map((layer: any) => layer.id);
            labelLayerNames.forEach((layerId) => {
              map.removeLayer(layerId);
            });
          }
          mapRef.current = ref;
          applyMapProjection(map, lights, is3dMapEnabled);
          switchLayerVisibility(map, lights);
          applyMapboxTerrain(map, is3dMapEnabled);
        });
      }
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        applyMapProjection(map, lights, is3dMapEnabled);
        switchLayerVisibility(map, lights);
        applyMapboxTerrain(map, is3dMapEnabled);
      }
    },
    [mapRef, lights, is3dMapEnabled]
  );

  useEffect(() => {
    if (isBigMap && IS_CHINESE && !mapGeoData && !isLoadingMapData) {
      setIsLoadingMapData(true);
      geoJsonForMap()
        .then((data) => {
          setMapGeoData(data);
          setIsLoadingMapData(false);
        })
        .catch(() => {
          setIsLoadingMapData(false);
        });
    }
  }, [isBigMap, IS_CHINESE, mapGeoData, isLoadingMapData]);

  const combinedGeoData = useMemo(() => {
    if (isBigMap && IS_CHINESE && mapGeoData) {
      // Show boundary and line together, combine geoData(only when not combine yet)
      if (geoData.features.length === initGeoDataLength) {
        return {
          type: 'FeatureCollection' as const,
          features: geoData.features.concat(mapGeoData.features),
        };
      }
    }
    return geoData;
  }, [geoData, initGeoDataLength, isBigMap, mapGeoData]);

  // Memoize expensive calculations
  const {
    isSingleRun,
    isSingleDisplayOnly,
    startLon,
    startLat,
    endLon,
    endLat,
  } = useMemo(() => {
    const isSingle =
      geoData.features.length === 1 &&
      geoData.features[0].geometry.coordinates.length;
    const singleFeature = isSingle ? geoData.features[0] : null;
    const singleActivityType = singleFeature?.properties?.activityType;

    let startLon = 0;
    let startLat = 0;
    let endLon = 0;
    let endLat = 0;

    if (isSingle) {
      const points = geoData.features[0].geometry.coordinates as Coordinate[];
      [startLon, startLat] = points[0];
      [endLon, endLat] = points[points.length - 1];
    }

    return {
      isSingleRun: isSingle,
      isSingleDisplayOnly:
        singleActivityType === 'Flight' || singleActivityType === 'Train',
      startLon,
      startLat,
      endLon,
      endLat,
    };
  }, [geoData]);

  const dash = useMemo(() => {
    return USE_DASH_LINE && !isSingleRun && !isBigMap ? [2, 2] : [2, 0];
  }, [isSingleRun, isBigMap]);

  const onMove = useCallback(({ viewState }: { viewState: IViewState }) => {
    setLocalViewState(viewState);
  }, []);

  const onMoveEnd = useCallback(
    ({ viewState }: { viewState: IViewState }) => {
      setViewState(viewState);
    },
    [setViewState]
  );

  const style: React.CSSProperties = useMemo(
    () => ({
      width: '100%',
      height: MAP_HEIGHT,
      backgroundColor: lights
        ? GLOBE_DARK_BACKGROUND_COLOR
        : LIGHTS_OFF_BACKGROUND_COLOR,
      maxWidth: '100%', // Prevent overflow on mobile
    }),
    [lights]
  );

  const fullscreenButton: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      marginTop: '29.2px',
      right: '0px',
      opacity: 0.3,
    }),
    []
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // start route animation using RouteAnimator
  const startRouteAnimation = useCallback(() => {
    if (!isSingleRun) return;
    const points = geoData.features[0].geometry.coordinates as Coordinate[];
    if (!points || points.length < 2) return;

    // Stop any existing animation
    if (routeAnimatorRef.current) {
      routeAnimatorRef.current.stop();
    }

    // Create new animator
    routeAnimatorRef.current = new RouteAnimator(
      points,
      setAnimatedPoints,
      () => {
        routeAnimatorRef.current = null;
      }
    );

    // Start animation
    routeAnimatorRef.current.start();
  }, [geoData, isSingleRun]);

  // autoplay once when single run changes
  useEffect(() => {
    if (!isSingleRun) return;
    const pts = geoData.features[0].geometry.coordinates as Coordinate[];
    const key = `${pts.length}-${pts[0]?.join(',')}-${pts[pts.length - 1]?.join(',')}`;
    if (key && key !== lastRouteKeyRef.current) {
      lastRouteKeyRef.current = key;
      startRouteAnimation();
    }
    // cleanup on unmount
    return () => {
      if (routeAnimatorRef.current) {
        routeAnimatorRef.current.stop();
      }
    };
  }, [geoData, isSingleRun, startRouteAnimation]);

  // Force animation when animationTrigger changes (for table clicks)
  useEffect(() => {
    if (animationTrigger && animationTrigger > 0 && isSingleRun) {
      startRouteAnimation();
    }
  }, [animationTrigger, isSingleRun, startRouteAnimation]);

  const handleMapClick = useCallback(() => {
    if (!isSingleRun) return;
    startRouteAnimation();
  }, [isSingleRun, startRouteAnimation]);

  return (
    <Map
      {...localViewState}
      projection="globe"
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      onClick={handleMapClick}
      style={style}
      mapStyle={mapStyle}
      ref={mapRefCallback}
      cooperativeGestures={isTouchDevice()}
      mapboxAccessToken={MAPBOX_TOKEN}
      onError={handleMapError}
      onData={(event) => {
        if ((event as any).tile?.state === 'errored') {
          handleTileError();
        }
      }}
    >
      {mapError && (
        <div className={styles.mapErrorNotification}>
          <span>{mapError}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
      <RunMapButtons changeYear={changeYear} thisYear={thisYear} />
      <Source id="data" type="geojson" data={combinedGeoData}>
        <Layer
          id="province"
          type="fill"
          paint={{
            'fill-color': PROVINCE_FILL_COLOR,
            'fill-opacity': 0.2,
          }}
          filter={filterProvinces}
        />
        <Layer
          id="countries"
          type="fill"
          paint={{
            'fill-color': COUNTRY_FILL_COLOR,
            // in China, fill a bit lighter while already filled provinces
            'fill-opacity': ['case', ['==', ['get', 'name'], '中国'], 0.1, 0.5],
          }}
          filter={filterCountries}
        />
        <Layer
          id="runs2-casing"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['!=', ['get', 'activityType'], 'Flight'],
            ['!=', ['get', 'activityType'], 'Train'],
          ]}
          paint={{
            'line-color': '#0f172a',
            'line-width': isSatelliteMap ? (isBigMap && lights ? 3.5 : 4.5) : 0,
            'line-dasharray': dash,
            'line-opacity': isSatelliteMap ? 0.82 : 0,
            'line-blur': isSatelliteMap ? 0.6 : 0,
          }}
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
          }}
        />
        <Layer
          id="runs2"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['!=', ['get', 'activityType'], 'Flight'],
            ['!=', ['get', 'activityType'], 'Train'],
          ]}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': isSatelliteMap
              ? isBigMap && lights
                ? 2
                : 3
              : isBigMap && lights
                ? 1
                : 2,
            'line-dasharray': dash,
            'line-opacity':
              isSatelliteMap || isSingleRun || isBigMap || !lights
                ? 1
                : LINE_OPACITY,
            'line-blur': isSatelliteMap ? 0.2 : 1,
          }}
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
          }}
        />
        <Layer
          id="display-only-routes-casing"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['in', ['get', 'activityType'], ['literal', ['Flight', 'Train']]],
          ]}
          paint={{
            'line-color': '#0f172a',
            'line-width': isSatelliteMap ? (isBigMap && lights ? 3.5 : 4.5) : 0,
            'line-dasharray': [2, 2],
            'line-opacity': isSatelliteMap ? 0.82 : 0,
            'line-blur': isSatelliteMap ? 0.6 : 0,
          }}
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
          }}
        />
        <Layer
          id="display-only-routes"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['in', ['get', 'activityType'], ['literal', ['Flight', 'Train']]],
          ]}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': isSatelliteMap
              ? isBigMap && lights
                ? 2
                : 3
              : isBigMap && lights
                ? 1
                : 2,
            'line-dasharray': [2, 2],
            'line-opacity':
              isSatelliteMap || isSingleRun || isBigMap || !lights
                ? 1
                : LINE_OPACITY,
            'line-blur': isSatelliteMap ? 0.2 : 1,
          }}
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
          }}
        />
      </Source>
      {isSingleRun && animatedPoints.length > 0 && (
        <Source
          id="animated-run"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { color: singleRunColor },
                geometry: {
                  type: 'LineString',
                  coordinates: animatedPoints,
                },
              },
            ],
          }}
        >
          <Layer
            id="animated-run-casing"
            type="line"
            paint={{
              'line-color': '#0f172a',
              'line-width': isSatelliteMap ? 5 : 5,
              'line-dasharray': isSingleDisplayOnly ? [2, 2] : [2, 0],
              'line-opacity': isSatelliteMap ? 0.88 : 0,
              'line-blur': isSatelliteMap ? 0.6 : 0,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
          <Layer
            id="animated-run"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': isSatelliteMap ? 3.5 : 3,
              'line-dasharray': isSingleDisplayOnly ? [2, 2] : [2, 0],
              'line-opacity': 1,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
        </Source>
      )}
      {isSingleRun && (
        <RunMarker
          startLat={startLat}
          startLon={startLon}
          endLat={endLat}
          endLon={endLon}
        />
      )}
      <span className={styles.runTitle}>{title}</span>
      <FullscreenControl style={fullscreenButton} />
      {!PRIVACY_MODE && <LightsControl setLights={setLights} lights={lights} />}
      {!PRIVACY_MODE && lights && (
        <MapStyleControl
          mapStyleVariant={mapStyleVariant}
          setMapStyleVariant={handleMapStyleVariantChange}
        />
      )}
      {!PRIVACY_MODE && lights && (
        <MapDimensionControl
          is3dMapEnabled={is3dMapEnabled}
          setIs3dMapEnabled={setIs3dMapEnabled}
        />
      )}
      <NavigationControl
        showCompass={false}
        position={'bottom-right'}
        style={{ opacity: 0.3 }}
      />
    </Map>
  );
};

export default RunMap;
