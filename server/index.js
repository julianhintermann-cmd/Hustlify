import { loadConfig, dbPath, dataDir } from './config.js';
import { openDatabase } from './db.js';
import { ensureSecret } from './auth.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDatabase(dbPath());
const secret = ensureSecret(dataDir());
const app = createApp({ db, config, secret });

const server = app.listen(config.app.port, () => {
  console.log(`[hustlify] "${config.app.title}" listening on port ${config.app.port}`);
  console.log(`[hustlify] timezone=${config.app.timezone} auth=${config.auth.password ? 'on' : 'off'}`);
});

function shutdown(signal) {
  console.log(`[hustlify] ${signal} received, shutting down.`);
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
