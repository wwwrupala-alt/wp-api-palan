import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiApp } from './src/server/apiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Mount API endpoints
app.use(apiApp);

// Serve static frontend assets from Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CloudWABA SaaS server listening on port ${PORT}`);
});
