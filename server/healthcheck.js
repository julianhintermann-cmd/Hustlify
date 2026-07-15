// Container healthcheck. Reads the configured port (so a custom app.port still
// works) and probes the /healthz endpoint. Exits non-zero on any failure.
import { loadConfig } from './config.js';

const { app } = loadConfig();
const url = `http://127.0.0.1:${app.port}/healthz`;

fetch(url)
  .then((res) => process.exit(res.ok ? 0 : 1))
  .catch(() => process.exit(1));
