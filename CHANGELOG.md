# Changelog

All notable changes to this project will be documented in this file.

## v0.1.6 - 2026-09-23

- The Google Drive section is down to three rows. A single **Google account**
  entry replaces the OAuth client entry and the connect row. It shows the
  connected email, or _Not connected_ with a warning. Its page holds the setup
  tip, client ID, client secret and the token with **Connect**. Once
  connected, only the account and **Forget on this device** remain.
- Connect focuses the first empty field again.
- **Last sync** now updates when a sync ends. It used to keep the previous
  time or error until the settings were reopened.

## v0.1.5 - 2026-09-23

- On phones, the refresh token field under **Connect account** was squeezed
  into a tiny pill next to the Connect button. It now has a full-width line of
  its own, with the Connect button below it.

## v0.1.4 - 2026-09-23

- The OAuth client ID, client secret and setup tip moved to an **OAuth
  client** page under Google Drive. The entry reads _Configured_ or _Not set_
  and shows a warning until both are entered, so the section stays short once
  a device is set up. Stored values and where they live are unchanged.
- Connect with a missing client ID or secret now points to that page.

## v0.1.3 - 2026-09-23

Internal only; nothing changes in how the plugin syncs.

- The shared `any` alias is gone. Function and constructor constraints take
  `never` parameters, and the event bus root and memory database are typed
  `never`, which fits every module's own event map and schema.
- Turned off a lint rule that capitalised the first word of every comment
  line. It had been rewriting the MIT notice carried in
  `src/smart-merge/diff3/`, which is a block comment again and reads as
  written.

## v0.1.2 - 2026-09-23

- Google Drive is selected as the storage backend out of the box, so a fresh
  install starts at the client ID.
- **Connect** checks the client ID, client secret and token fields first and
  puts the cursor in the first one still empty, instead of failing at Google.
  The token field and its button now get a line of their own.
- The **Last sync** row at the top carries a **Start sync** button, disabled
  while a sync is running.
- The legend for the Match and Speed labels moved down, just above
  Development.
- Dropped a lint suppression the Obsidian plugin review flags as an error.

## v0.1.1 - 2026-09-23

Housekeeping only; sync behaviour is unchanged.

- The active toggle in filter rules is styled by selector specificity instead
  of `!important`, so a theme can still override it.
- Fewer loose types: the module context no longer declares its own `any` or
  uses the bare `Function` type, and the translation lookup dropped a
  redundant assertion.
- LICENSE is plain MIT again, so GitHub recognises it. The notice covering the
  code this project builds on moved to NOTICE.
- Shorter plugin description in the manifest.

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
