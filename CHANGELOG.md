# Changelog

All notable changes to this project will be documented in this file.

## v0.1.13 - 2026-09-23

- While a risky strategy is selected, the Sync strategy or Conflict resolve
  strategy entry says why it shows a warning, for example _Files only on
  Drive are deleted. Switch back to Bidirectional after one sync._ (#49)

## v0.1.12 - 2026-09-23

- **Reset to defaults** at the bottom of Advanced puts every setting back to
  what a fresh install uses, after a confirmation. The Google account, OAuth
  client, base directory and sync records are kept (#23).

Fixes:

- Choosing a strategy no longer adds another radio button in front of every
  row on the Sync strategy and Conflict resolve strategy pages (#46).

## v0.1.11 - 2026-09-23

- **Sync strategy** opens a page instead of a dropdown. Each strategy has a
  one-line explanation and a small Vault ⇄ Drive diagram. Mirror local and
  Mirror remote sit under _For repairs: switch back after one sync_, and the
  entry shows a warning while one of them is selected (#21).
- **Conflict resolve strategy** opens a page split into _Nothing lost_
  (Rename and keep both, Smart merge, Skip) and _Replaces one version_
  (Latest survives, Keep local, Keep remote), with an example for Rename and
  keep both. The entry warns while a version-replacing strategy is selected.
  Smart merge's markers moved from Advanced to _Merge markers_, shown under
  the options while Smart merge is selected (#22).

## v0.1.10 - 2026-09-23

- The end of the settings has a **Help and support** row with three icons
  (setup guide, report a bug, request a feature) and a yellow **Buy me a
  coffee** footer in its own style, with the installed version below it. The
  Help and support page is gone (#39).
- **Bug** and **Request** open GitHub issue forms that label themselves, with
  the Drive Bridge version, Obsidian version and platform already filled in
  (#33).
- The how-it-works diagram in the README has the Google Drive cloud level
  with the other shapes (#37).

For maintainers:

- `bun ver X.Y.Z` prepares a release: it opens the CHANGELOG section, then
  updates `manifest.json`, `package.json` and `versions.json`.
  `bun ver --check [tag]` runs in CI and in the release job (#34).
- `bun changelog <milestone>` drafts release notes from the milestone (#35).
- `versions.json` lists every release for the Obsidian community store (#36).

## v0.1.9 - 2026-09-23

- The settings are split into pages. The main screen keeps Last sync, the
  sync and conflict strategies and the Google Drive group, then links to
  **Automatic sync**, **Filter rules**, **Advanced** and **Help and
  support**. Each entry shows a short summary, such as how many automatic
  syncs are on (#20).
- The Google account entry says what to do next: _Tap to connect_ (or
  _Click to connect_), _Client secret missing_ or _Client ID missing_,
  instead of _Connected_ with a warning (#30).

## v0.1.8 - 2026-09-23

- **Bugs and requests** has two labelled buttons, **Bug** and **Request**,
  each opening a GitHub issue form with its own template and the versions
  filled in. The old button showed only a bug icon (#14).
- **Clear records** asks for confirmation before forgetting the sync state
  (#15).
- On phones, the Smart merge marker fields are stacked and show the whole
  marker instead of a cut-off one (#16).
- The **Storage backend** row is hidden while Google Drive is the only
  backend. The connection check icon moved to the _Connected as_ row on the
  Google account page (#17).
- The Match and Speed legend card is gone; the labels keep their tooltips
  and the settings reference explains them. Labels after an off-screen item
  are no longer skipped (#18).
- **Buy me a coffee** is a plain button, so the accent colour marks only
  Start sync and Connect (#19).

## v0.1.7 - 2026-09-23

- Every setting description is now one short sentence, so the settings fit a
  phone screen. The Base directory warning, where secrets are stored, the
  Clear records caveat and the Report a problem privacy note are kept. The
  full detail stays in the settings reference.

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
