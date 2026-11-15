import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → la web funciona servida desde cualquier carpeta o túnel HTTPS.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['front-nasa.los5furiosos.cloud'],
  },
  // La integración usa node:test y se ejecuta por separado, sin mezclar runners.
  test: { environment: 'node', include: ['src/**/*.test.{js,jsx}'] },
})
