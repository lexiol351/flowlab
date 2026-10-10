import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/global.css';
import App from './App.tsx';
import {
  registerServiceWorkerUpdate,
  useFlowStore,
} from './lib/store/useFlowStore.ts';

// Register the service worker. `registerType: 'prompt'` means updates are
// applied only when the user confirms via the update banner.
const updateSW = registerSW({
  onNeedRefresh() {
    registerServiceWorkerUpdate(() => {
      void updateSW(true);
    });
    useFlowStore.getState().setUpdateAvailable(true);
  },
});

window.addEventListener('online', () => {
  useFlowStore.getState().setOnline(true);
});
window.addEventListener('offline', () => {
  useFlowStore.getState().setOnline(false);
});

void useFlowStore.getState().bootstrap();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('FlowLab: #root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
