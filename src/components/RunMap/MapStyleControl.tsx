import styles from './style.module.css';

interface IMapStyleControlProps {
  mapStyleVariant: 'original' | 'dashboard';
  setMapStyleVariant: (_variant: 'original' | 'dashboard') => void;
}

const styleOptions = [
  { id: 'original' as const, label: 'Original' },
  { id: 'dashboard' as const, label: 'Dashboard' },
];

const MapStyleControl = ({
  mapStyleVariant,
  setMapStyleVariant,
}: IMapStyleControlProps) => {
  return (
    <div className={'mapboxgl-ctrl mapboxgl-ctrl-group ' + styles.mapStyleCtrl}>
      {styleOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.mapStyleButton} ${
            mapStyleVariant === option.id ? styles.mapStyleButtonActive : ''
          }`}
          onClick={() => setMapStyleVariant(option.id)}
          title={`Switch map style to ${option.label}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default MapStyleControl;
