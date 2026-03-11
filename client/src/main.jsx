import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { useNetworkStore } from './store/networkStore';
import OfflineBanner from './components/OfflineBanner';
import SyncStatusBar from './components/SyncStatusBar';
import { initSyncManager } from './offline/syncManager';
import './index.css';

// Инициализировать сетевой мониторинг
useNetworkStore.getState().init();

// Инициализировать менеджер синхронизации
initSyncManager();

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <OfflineBanner />
    <App />
    <SyncStatusBar />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#1e1e2e',
          color: '#e4e4ef',
          border: '1px solid #2e2e44',
        },
      }}
    />
  </BrowserRouter>
);
