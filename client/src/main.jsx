import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
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
