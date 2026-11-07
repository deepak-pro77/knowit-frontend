import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 5173 matches the backend's default CORS allow-list (knowit.cors.allowed-origins).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
