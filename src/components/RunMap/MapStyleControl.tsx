import styles from './style.module.css';

interface IMapStyleControlProps {
  mapStyleVariant: 'original' | 'satellite';
  setMapStyleVariant: (_variant: 'original' | 'satellite') => void;
}

const styleOptions = [
  { id: 'original' as const, label: 'Mapbox v11' },
  { id: 'satellite' as const, label: 'Satellite' },
];

const MapStyleControl = ({
  mapStyleVariant,
  setMapStyleVariant,
}: IMapStyleControlProps) => {
  const nextVariant = mapStyleVariant === 'original' ? 'satellite' : 'original';

  return (
    <div className={'mapboxgl-ctrl mapboxgl-ctrl-group ' + styles.mapStyleCtrl}>
      <button
        type="button"
        className={`${styles.mapStyleButton} ${
          mapStyleVariant === 'satellite'
            ? styles.mapStyleDashboard
            : styles.mapStyleOriginal
        }`}
        onClick={() => setMapStyleVariant(nextVariant)}
        title={`Switch map style to ${
          styleOptions.find((option) => option.id === nextVariant)?.label
        }`}
        aria-label={`Switch map style to ${
          styleOptions.find((option) => option.id === nextVariant)?.label
        }`}
      >
        <span className="mapboxgl-ctrl-icon" aria-hidden="true"></span>
      </button>
    </div>
  );
};

export default MapStyleControl;
