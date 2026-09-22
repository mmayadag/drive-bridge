# Changelog

All notable changes to this project will be documented in this file.

## v0.1.0 - 2026-09-23

First version of Drive Bridge.

### Sync

- Two-way sync between a vault and one Google Drive folder, on desktop and
  mobile.
- Sees every file in the folder, including files other apps put there (full
  `drive` scope).
- Conflicting edits keep both versions (`name.conflict.md`). Optional smart
  merge does a three-way text merge and also keeps both when it cannot.
- The Drive folder holds a normal folder tree, so other apps and backups see
  the same structure as the vault.
- Remote deletions ask for confirmation during automatic sync.
- Syncs on startup, every 15 minutes, and when you leave Obsidian with unsaved
  changes pending; on-change sync can be switched on per device. All of them
  are configurable in the settings.
- Manual syncs show the planned changes before they run.
- Settings show when this device last synced and how it ended.

### Sign-in

- Bring your own Google Cloud OAuth client; nothing is compiled into the
  plugin.
- Pick the Drive folder from a browser in the settings, or create one there.
- Connect by pasting a refresh token from `rclone authorize`. The token is
  verified before it is saved, including that it grants full Drive access.
- Client secret and refresh token are kept in the device's secure storage,
  never in synced files.

### Extras

- Optional webhooks: POST to a URL of your choice before and after each sync.

- A support section in the settings: report a problem with the versions
  prefilled, or buy the author a coffee.

### Safety

- No code is downloaded or evaluated at runtime; everything ships in
  `main.js`.
- Network requests go only to Google, plus a webhook URL if you set one.
- No telemetry and no analytics of any kind.
- `main.js` contains no third-party libraries.
