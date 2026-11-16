import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

function ragApiPlugin(): Plugin {
  return {
    name: 'rag-api-plugin',
    async configureServer(server) {
      const express = (await import('express')).default;
      const { ragApiRouter } = await import('./server/api.ts');
      const app = express();
      app.use(express.json({ limit: '25mb' }));
      app.use(express.urlencoded({ extended: true, limit: '25mb' }));
      app.use('/api/rag', ragApiRouter);
      server.middlewares.use(app);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), ragApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
