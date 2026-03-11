import { useSyncStore, runSync } from '../offline/syncManager';
import * as syncQueue from '../offline/syncQueue';
import { useNetworkStore } from '../store/networkStore';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function SyncStatusBar() {
  const { syncing, pendingCount, failedCount, progress } = useSyncStore();
  const isOnline = useNetworkStore((s) => s.isOnline);

  // Ничего не показывать если нет операций
  if (!syncing && pendingCount === 0 && failedCount === 0) return null;

  const handleRetry = async () => {
    await syncQueue.retryFailed();
    runSync();
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 'var(--safe-area-bottom, 0)',
      left: 0,
      right: 0,
      zIndex: 9998,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
    }}>
      {syncing ? (
        <>
          <RefreshCw size={16} className="spin-animation" style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 4 }}>Синхронизация...</div>
            <div style={{
              height: 3, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', background: 'var(--accent)', borderRadius: 2,
                width: `${Math.round(progress * 100)}%`, transition: 'width 0.3s',
              }} />
            </div>
          </div>
        </>
      ) : failedCount > 0 ? (
        <>
          <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
          <span style={{ flex: 1, color: 'var(--danger)' }}>
            {failedCount} {failedCount === 1 ? 'операция' : 'операций'} не синхронизирован{failedCount === 1 ? 'а' : 'о'}
          </span>
          {isOnline && (
            <button
              onClick={handleRetry}
              style={{
                padding: '4px 12px', background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                fontSize: 12, border: '1px solid var(--border-color)',
              }}
            >
              Повторить
            </button>
          )}
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ flex: 1, color: 'var(--warning)' }}>
            {pendingCount} {pendingCount === 1 ? 'операция ожидает' : 'операций ожидают'} синхронизации
          </span>
        </>
      ) : null}
    </div>
  );
}
