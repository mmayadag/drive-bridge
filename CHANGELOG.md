# Changelog

All notable changes to this project will be documented in this file.

## v0.1.0 - Unreleased

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
- Syncs on startup and every 15 minutes out of the box; on-change sync can be
  switched on per device. All three are configurable in the settings.
- Manual syncs show the planned changes before they run.
- Settings show when this device last synced and how it ended.

### Sign-in

- Bring your own Google Cloud OAuth client; nothing is compiled into the
  plugin.
- Connect by pasting a refresh token from `rclone authorize`. The token is
  verified before it is saved, including that it grants full Drive access.
- Client secret and refresh token are kept in the device's secure storage,
  never in synced files.

### Safety

- No code is downloaded or evaluated at runtime; everything ships in
  `main.js`.
- Network requests go only to Google.
- `main.js` contains no third-party libraries.
