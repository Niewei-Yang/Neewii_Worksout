import styles from './style.module.css';

interface IMapStyleControlProps {
  mapStyleVariant: 'original' | 'dashboard';
  setMapStyleVariant: (_variant: 'original' | 'dashboard') => void;
}

const styleOptions = [
  { id: 'original' as const, label: 'Mapbox v11' },
  { id: 'dashboard' as const, label: '3D Satellite' },
];

const MapStyleControl = ({
  mapStyleVariant,
  setMapStyleVariant,
}: IMapStyleControlProps) => {
  const nextVariant = mapStyleVariant === 'original' ? 'dashboard' : 'original';

  return (
    <div className={'mapboxgl-ctrl mapboxgl-ctrl-group ' + styles.mapStyleCtrl}>
      <button
        type="button"
        className={`${styles.mapStyleButton} ${
          mapStyleVariant === 'dashboard'
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
