import { loadConfig, dbPath, dataDir } from './config.js';
import { openDatabase } from './db.js';
import { ensureSecret } from './auth.js';
import { createApp } from './app.js';
import { createNotifier } from './notify.js';

const config = loadConfig();
const db = openDatabase(dbPath());
const secret = ensureSecret(dataDir());
const app = createApp({ db, config, secret });

const server = app.listen(config.app.port, () => {
  console.log(`[hustlify] "${config.app.title}" listening on port ${config.app.port}`);
  console.log(`[hustlify] timezone=${config.app.timezone} auth=${config.auth.password ? 'on' : 'off'}`);
});

// Push notifications (timer reminder, daily/weekly summaries) are entirely
// optional — only poll for them when an ntfy URL is actually configured.
let notifyInterval = null;
if (config.notifications.ntfy_url) {
  const notifier = createNotifier({ db, config });
  notifyInterval = setInterval(() => notifier.check(), 60_000);
  console.log(`[hustlify] ntfy notifications enabled -> ${config.notifications.ntfy_url}`);
}

function shutdown(signal) {
  console.log(`[hustlify] ${signal} received, shutting down.`);
  if (notifyInterval) clearInterval(notifyInterval);
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
