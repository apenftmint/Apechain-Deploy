import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // As per user's provided Tailwind docs for Vite

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Initialize the Tailwind CSS plugin for Vite
  ],
  // server: {
  //   // Optional: configure server settings like port
  //   port: 3000, 
  // },
  // build: {
  //   // Optional: configure build settings
  //   outDir: 'dist',
  // }
})
