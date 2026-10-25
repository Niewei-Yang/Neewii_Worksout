import { useState } from 'react';
import { GeolocateControl } from 'react-map-gl';
import { IS_CHINESE } from '@/utils/const';
import styles from './style.module.css';

const UserLocationControl = () => {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <GeolocateControl
        position="bottom-left"
        // Leave room for the route title and attribution at the bottom.
        style={{ margin: '0 0 40px 10px' }}
        positionOptions={{
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }}
        fitBoundsOptions={{ maxZoom: 16 }}
        trackUserLocation
        showUserLocation
        showAccuracyCircle
        onGeolocate={() => setError(null)}
        onTrackUserLocationStart={() => setError(null)}
        onError={(event) => {
          switch (event.code) {
            case 1:
              setError(
                IS_CHINESE
                  ? '定位权限被拒绝，请在浏览器的网站设置中允许定位后刷新页面。'
                  : 'Location access was denied. Allow location in your browser’s site settings, then reload.'
              );
              break;
            case 3:
              setError(
                IS_CHINESE
                  ? '定位超时，请检查设备的定位服务，或到信号较好的地方重试。'
                  : 'Location timed out. Check your device’s location services or try again with a better signal.'
              );
              break;
            default:
              setError(
                IS_CHINESE
                  ? '暂时无法获取位置，请确认设备已开启定位服务后重试。'
                  : 'Location is unavailable. Enable your device’s location services and try again.'
              );
          }
        }}
      />
      {error && (
        <div className={styles.userLocationMessage} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={
              IS_CHINESE ? '关闭定位提示' : 'Dismiss location message'
            }
          >
            ×
          </button>
        </div>
      )}
    </>
  );
};

export default UserLocationControl;
