# Changelog

All notable changes to Hustlify are documented in this file.

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
