# Changelog

All notable changes to Hustlify are documented in this file.

## 1.2.0

### Added

- **Database restore** — upload a backup file to replace the live database in place (no restart needed). The file is validated (SQLite header, expected tables/columns) before anything is touched, so an unrelated or corrupt file is rejected with a clear error rather than corrupting your data.
- **CSV import** — import entries from the same CSV shape the app exports. Categories referenced by name that don't exist yet are created automatically.
- **Idle / away detection** — if the timer's tick reveals a large gap (the browser tab was hidden/throttled, or the device slept), a "Welcome back" prompt lets you discard the idle time, stop the timer at the point you went idle, or keep it. Configurable via `work.idle_detection_minutes` (default 5, `0` disables it).
- **ntfy push notifications** (optional) — a timer-still-running reminder, a daily summary, and a weekly summary, each sent once per occurrence via a self-hosted or public [ntfy](https://ntfy.sh) topic. Off by default; set `notifications.ntfy_url` to enable.
- **Dark mode** — a theme toggle in the header cycles System / Light / Dark. "System" follows the OS live; your choice is remembered per device.
- **Undo on delete** — deleting an entry now shows a 6-second "Undo" toast instead of a blocking confirmation dialog.
- **Year activity heatmap + streak** — a GitHub-contributions-style calendar on the Dashboard shows the last year of tracked time at a glance, plus your current daily streak.
- **Mobile layout fixes** — several field rows (manual time entry, entry filters, category color/name) that were squeezing side-by-side on phones now stack into a single column.

### Configuration

- New `work.idle_detection_minutes` key (default `5`; `0` disables the idle prompt).
- New `notifications` section: `ntfy_url`, `timer_reminder`, `daily_summary_at`, `weekly_summary_at`. See `config.example.yaml`.

## 1.1.0

### Added

- **Long-running timer warning** — an amber banner appears on the timer card once it has been running for more than `work.long_timer_warning_hours` (default 10h, set to `0` to disable). Catches the classic "forgot to stop the timer" case before it inflates your stats.
- **Edit the running timer** — adjust the start time, category, or note of a timer that's still running, without stopping it first.
- **Quick "Start again"** — restart a new timer pre-filled with a past entry's category and note, straight from the entries list.
- **Database backup download** — a one-click download of a complete, consistent copy of the SQLite database from the Reports view (`GET /api/backup.db`), independent of any date filter.
- **Date-range presets in Reports** — This week / Last 7 days / This month / Last month, one click instead of picking dates by hand.
- **Mobile & touch layout** — the app now detects phone-sized viewports and switches to a bottom tab bar, card-style entries (instead of a wide table), bottom-sheet modals, and larger touch targets. Desktop is unchanged.
- **Add to Home Screen** — a web app manifest, theme color, and touch icons let you install Hustlify on a phone home screen like a native app.

### Configuration

- New `work.long_timer_warning_hours` key (default `10`; `0` disables the warning). See `config.example.yaml`.

## 1.0.0

Initial release: manual time entry, start/stop timer, categories, dashboard with overtime and earnings, PDF work report, CSV export, optional password auth, full YAML configuration, single-container Docker image (multi-arch).
