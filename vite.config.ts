import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Optional: Proxy API requests if your backend is on a different port during dev
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3001', // Your backend server
    //     changeOrigin: true,
    //   }
    // }
  }
})
