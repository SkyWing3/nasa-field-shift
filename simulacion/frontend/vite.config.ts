import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };
import { worldPublishedAssets } from './src/world/worldAssets.ts';
import { assetLibraryBuildPlugin, assetLibraryPlugin } from './vite-plugins/assetLibrary.ts';

// https://vite.dev/config/
export default defineConfig({
  // `asset-library/` completa solo se sirve en desarrollo (ADR-019); el build de producción
  // publica únicamente lo que usa el mundo 3D (ADR-040).
  plugins: [
    react(),
    assetLibraryPlugin(path.resolve(import.meta.dirname, 'asset-library')),
    assetLibraryBuildPlugin(
      path.resolve(import.meta.dirname, 'asset-library'),
      worldPublishedAssets(),
    ),
  ],

  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['nasa-simulacion.los5furiosos.cloud'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Los núcleos de Three.js (~743 kB) y MapLibre GL (~1 050 kB) minificados no son divisibles;
    // ambos se cargan de forma diferida en chunks propios. El umbral queda justo por encima del
    // mayor para detectar cualquier otro crecimiento (ver docs/DECISIONS.md, ADR-011 y ADR-033).
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Three.js cambia mucho menos que el código de la aplicación: en un chunk
          // propio, la caché del navegador sobrevive a los despliegues. Solo se agrupa
          // `three` porque no tiene dependencias; agrupar R3F arrastraría React (los
          // grupos incluyen dependencias recursivamente) y rompería la carga diferida.
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: 'maplibre', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    // Las pruebas unitarias cubren lógica pura (dominio, estado, cliente HTTP, formato,
    // pipeline de assets). La UI y el renderizado WebGL se verifican con Playwright (e2e/).
    environment: 'node',
    include: ['src/**/*.test.ts', 'asset-pipeline/**/*.test.ts', 'vite-plugins/**/*.test.ts'],
    restoreMocks: true,
  },
});
