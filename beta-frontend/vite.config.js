import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → la web funciona servida desde cualquier carpeta o túnel HTTPS.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  test: { environment: 'node' },
})
