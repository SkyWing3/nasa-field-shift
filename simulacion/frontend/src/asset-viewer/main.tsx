import '../ui/styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AssetViewerApp } from './AssetViewerApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root en asset-viewer.html');
}

createRoot(container).render(
  <StrictMode>
    <AssetViewerApp />
  </StrictMode>,
);
