import './ui/styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { hydrateSavedSite } from './app/services';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root en index.html');
}

// La ubicación guardada se lee antes del primer render para no mostrar un estado intermedio.
hydrateSavedSite();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
