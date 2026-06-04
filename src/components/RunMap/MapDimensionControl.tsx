import styles from './style.module.css';

interface IMapDimensionControlProps {
  is3dMapEnabled: boolean;
  setIs3dMapEnabled: (_enabled: boolean) => void;
}

const MapDimensionControl = ({
  is3dMapEnabled,
  setIs3dMapEnabled,
}: IMapDimensionControlProps) => {
  const nextMode = is3dMapEnabled ? '2D' : '3D';

  return (
    <div
      className={'mapboxgl-ctrl mapboxgl-ctrl-group ' + styles.mapDimensionCtrl}
    >
      <button
        type="button"
        className={styles.mapDimensionButton}
        onClick={() => setIs3dMapEnabled(!is3dMapEnabled)}
        title={`Switch map to ${nextMode}`}
        aria-label={`Switch map to ${nextMode}`}
      >
        <span aria-hidden="true">{is3dMapEnabled ? '3D' : '2D'}</span>
      </button>
    </div>
  );
};

export default MapDimensionControl;
