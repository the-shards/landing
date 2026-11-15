import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { apiBase } from './src/config.js';
import { buildCsp } from './csp.js';

function cspPlugin(mode) {
  const origin = new URL(apiBase(loadEnv(mode, process.cwd(), 'VITE_'))).origin;
  return {
    name: 'shards-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(origin) }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cspPlugin(mode)],
  // Hashed bundles go to /static (cached for a year); the files in public/ keep their names under /assets (cached for a day).
  build: { assetsDir: 'static' },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{js,jsx}'],
  },
}));
