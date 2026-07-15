import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Default configuration. Any key missing from the user's config.yaml falls back
// to the value defined here, so the app always starts with sensible behaviour.
export const DEFAULTS = {
  app: {
    title: 'Hustlify',
    port: 3000,
    timezone: 'Europe/Zurich',
    first_day_of_week: 'monday',
  },
  auth: {
    password: '',
  },
  work: {
    weekly_target_hours: 40,
    tracking_start: '',
    hourly_rate: 0,
    currency: 'CHF',
    long_timer_warning_hours: 10,
    idle_detection_minutes: 5,
  },
  report: {
    person_name: '',
    company_name: '',
    footer_note: '',
  },
  notifications: {
    ntfy_url: '',
    timer_reminder: true,
    daily_summary_at: '',
    weekly_summary_at: '',
  },
};

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Recursively merge a user object over the defaults. Only keys that exist in the
// defaults are honoured, which keeps the public config surface predictable.
function mergeDefaults(defaults, override) {
  if (!isPlainObject(override)) return structuredClone(defaults);
  const result = structuredClone(defaults);
  for (const key of Object.keys(defaults)) {
    if (!(key in override) || override[key] === null || override[key] === undefined) continue;
    if (isPlainObject(defaults[key])) {
      result[key] = mergeDefaults(defaults[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

// Load and validate configuration from a YAML file. A missing file is not an
// error — the app simply runs with defaults.
export function loadConfig(configPath = process.env.CONFIG_PATH || '/config/config.yaml') {
  let parsed = {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    parsed = yaml.load(raw) || {};
    if (!isPlainObject(parsed)) parsed = {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[config] Could not read ${configPath}: ${err.message}. Using defaults.`);
    } else {
      console.log(`[config] No config file at ${configPath}. Using defaults.`);
    }
    parsed = {};
  }

  const config = mergeDefaults(DEFAULTS, parsed);

  // Normalise / guard a few values so downstream code can trust them.
  config.app.port = Number(config.app.port) || DEFAULTS.app.port;
  config.app.first_day_of_week =
    config.app.first_day_of_week === 'sunday' ? 'sunday' : 'monday';
  config.auth.password = String(config.auth.password ?? '');
  config.work.weekly_target_hours = Math.max(0, Number(config.work.weekly_target_hours) || 0);
  config.work.hourly_rate = Math.max(0, Number(config.work.hourly_rate) || 0);
  config.work.currency = String(config.work.currency || DEFAULTS.work.currency);
  config.work.long_timer_warning_hours = Math.max(
    0,
    Number(config.work.long_timer_warning_hours) || 0,
  );
  config.work.idle_detection_minutes = Math.max(
    0,
    Number(config.work.idle_detection_minutes) || 0,
  );

  config.notifications.ntfy_url = String(config.notifications.ntfy_url || '').trim();
  config.notifications.timer_reminder = Boolean(config.notifications.timer_reminder);
  config.notifications.daily_summary_at = TIME_OF_DAY.test(config.notifications.daily_summary_at)
    ? config.notifications.daily_summary_at
    : '';
  config.notifications.weekly_summary_at = TIME_OF_DAY.test(config.notifications.weekly_summary_at)
    ? config.notifications.weekly_summary_at
    : '';

  return config;
}

// The subset of the configuration that is safe to expose to the browser.
// Never includes the auth password.
export function publicSettings(config) {
  return {
    title: config.app.title,
    timezone: config.app.timezone,
    firstDayOfWeek: config.app.first_day_of_week,
    authRequired: config.auth.password.length > 0,
    weeklyTargetHours: config.work.weekly_target_hours,
    trackingStart: config.work.tracking_start || null,
    hourlyRate: config.work.hourly_rate,
    currency: config.work.currency,
    longTimerWarningHours: config.work.long_timer_warning_hours,
    idleDetectionMinutes: config.work.idle_detection_minutes,
  };
}

// Resolve the on-disk location of the SQLite database and other persistent data.
export function dataDir() {
  return process.env.DATA_DIR || '/data';
}

export function dbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(dataDir(), 'hustlify.db');
}
