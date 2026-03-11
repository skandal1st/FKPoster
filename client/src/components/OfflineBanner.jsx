import { useNetworkStore } from '../store/networkStore';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const isOnline = useNetworkStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'var(--safe-area-top, 0)',
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'var(--warning)',
      color: '#000',
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 600,
    }}>
      <WifiOff size={16} />
      Нет соединения с сервером
    </div>
  );
}
