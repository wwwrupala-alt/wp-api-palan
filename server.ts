import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiApp } from './src/server/apiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, 'dist', 'index.html'));

  // 1. Mount API backend endpoints FIRST before any static or SPA fallback
  app.use(apiApp);

  if (isProduction && fs.existsSync(path.join(__dirname, 'dist'))) {
    // Production mode: serve static files from dist directory
    console.log('Serving production build from /dist');
    app.use(express.static(path.join(__dirname, 'dist')));

    // SPA fallback: any non-API route returns index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Development mode: mount Vite dev server as middleware
    console.log('Starting development server with Vite middleware');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudWABA SaaS server listening on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
