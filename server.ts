import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiApp } from './src/server/apiApp.ts';
import { startCampaignScheduler } from './src/server/campaignSchedulerService.ts';
import { startDripScheduler } from './src/server/dripSchedulerService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  
  // Resolve port: respect CLI argument --port, DEFAULT_APP_PORT, or default 3000 (never 8080 which is reserved for nginx)
  let PORT = 3000;
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    PORT = Number(process.argv[portArgIdx + 1]);
  } else if (process.env.DEFAULT_APP_PORT) {
    PORT = Number(process.env.DEFAULT_APP_PORT);
  } else if (process.env.PORT && process.env.PORT !== '8080') {
    PORT = Number(process.env.PORT);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Mount API backend endpoints FIRST before any static or SPA fallback
  app.use(apiApp);

  // 2. Initialize background schedulers for scheduled broadcasts & drip sequences
  startCampaignScheduler();
  startDripScheduler();

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
