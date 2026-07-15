import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

// Build the Express application around an open database and loaded config.
// `secret` signs the auth cookie. Kept free of side effects (no listen) so it
// can be exercised directly in tests.
export function createApp({ db, config, secret }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser(secret));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', createApiRouter({ db, config }));

  // Serve the built single-page app when present, falling back to index.html so
  // client-side routes resolve. During pure API tests the dist folder may not
  // exist yet, which is fine.
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  return app;
}
