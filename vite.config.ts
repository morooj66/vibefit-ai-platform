import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Absolute base in production: required for Vercel BrowserRouter hard refresh on deep routes.
  // HashRouter on Hugging Face also works from site root with absolute asset paths.
  base: mode === 'production' ? '/' : './',
}));
