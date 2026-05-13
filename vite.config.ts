import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// For GitHub Pages, set base to '/<repo-name>/' before deploying. Override
// via the VITE_BASE env var: VITE_BASE=/dcm-2026-browser/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
});
