# Changelog

All notable changes to this project will be documented in this file.

## v0.1.0 - Unreleased

First version of Drive Bridge.

### Sync

- Two-way sync between a vault and one Google Drive folder, on desktop and
  mobile.
- Sees every file in the folder, including files other apps put there (full
  `drive` scope).
- Conflicting text edits are merged with a three-way merge when possible;
  otherwise both versions are kept.
- Remote deletions ask for confirmation during automatic sync.
- Startup, scheduled and on-change sync; review tasks before they run.

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
