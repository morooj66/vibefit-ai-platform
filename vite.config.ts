import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const runtimeEnv = (
  globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
).process?.env;

const isVercelBuild = Boolean(runtimeEnv?.VERCEL);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vercel BrowserRouter needs absolute asset paths on deep-link refresh; HF keeps relative base.
  base: isVercelBuild ? '/' : './',
});
