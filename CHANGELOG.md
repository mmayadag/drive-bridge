# Changelog

All notable changes to this project will be documented in this file.

## v0.3.0 - 2026-09-24

Control and safety.

- **Undo one change** in the list a manual sync shows first: a row's undo
  button keeps the other side's version, or brings a deleted file back
  (folders included), instead of running the change (#74).
- **Sync this file**: command, note header button and file menu item for the
  open note (#75).
- **Exclude from sync** / **Include in sync** in the file and folder menu,
  with undo in the notice (#98).
- **Pause automatic sync** on this device, from the Automatic sync page or
  the command palette; manual syncs still run, and the status bar says so
  (#99).
- **Drive scan: Changes only** under Google Drive asks Drive only what changed
  since the last sync, much faster on a large Drive. It still lists everything
  on the first sync, once a day and whenever Drive cannot say. The sync log
  names the scan each time. Full scan stays the default (#73, #124).
- A sync that would upload, download or resolve more than 100 already synced
  files, and more than half of them, stops and asks first, like mass
  deletions (#97).
- **Sync history**: the last 30 syncs on this device, and the log in a window
  with a copy button (#56).
- **Copy problem report** puts versions, settings without secrets and the
  recent log on the clipboard in one step (#100).

Fixes:

- While a sync waited for confirmation, the progress showed a fixed
  _0/1 Completed_; the count now starts when the sync runs (#125).
- Ticking a deletion inside a deleted folder unticked the folder's deletion,
  so _Select all_ after unselecting all left it out (#74).

Maintenance:

- The built plugin is loaded as a phone and as a desktop in CI, so a crash
  like 0.2.0's cannot ship again (#117).
- Tests cover 99.9% of functions and 100% of lines, each test file runs
  isolated, and CI fails below 99% (#119, #121, #128, #130).
- The two `fetch` calls, which read large vault files from disk, are marked
  as such for the Obsidian review; PRIVACY.md says the clipboard is only
  written, on a copy button, and never read (#134).

## v0.2.1 - 2026-09-24

Fixes:

- The plugin failed to load since 0.1.16, on phones and desktop alike
  (_Failed to load plugin "drive-bridge"_). A command was registered before
  its name could be translated. Fixed, and a missing string no longer breaks
  loading (#115).

## v0.2.0 - 2026-09-24

Easy setup.

- **Sign in with Google** on the Google account page: Google opens in the
  browser, and the address it ends on is pasted back. No rclone or terminal,
  and it works on phones. Pasting a token still works (#70).
- The Google account page lists the four Google Cloud steps, each with a
  button to its Console page. Pasting the downloaded client JSON fills in the
  client ID and secret, and a client ID that does not look like one is
  outlined (#71).
- **Export settings** and **Import settings** under Advanced, and **Set up
  from another device** on a device that is not connected. The Google account
  travels only encrypted with a passphrase; device state never travels, and
  an existing account is only replaced after asking (#5).

## v0.1.17 - 2026-09-24

Maintenance only; the plugin behaves as in 0.1.16.

- Lint warnings now fail `bun check` and CI; CI and releases install from the
  lockfile as it is (#67).
- A release checklist in TECHNICAL.md covers what unit tests cannot: the
  settings in Obsidian, on desktop and on a phone (#68).
- `bun visual` renders the main settings rows at phone width in both themes
  for a quick layout check (#69).

## v0.1.16 - 2026-09-24

Safety release.

- A sync that would delete more than 50 files, or 5% of the vault, on the two
  sides together stops and asks. _Keep them_, also chosen by closing the
  dialog, copies each file back instead of deleting it (#60).
- **Never delete on Drive** on the main screen: files deleted in the vault
  stay on Google Drive and are not downloaded again, unless they change on
  Drive (#66).
- A file that fails three syncs in a row is skipped, with a notice naming it.
  Last sync shows how many files are skipped; **Retry** under Advanced or the
  _Retry skipped files_ command tries them again (#62).
- The README has a features list and a shorter install section (#64).
- Checked and documented: an interrupted sync resumes where it stopped (#61).

## v0.1.15 - 2026-09-24

- Sync errors read as a sentence: for example _Failed: Can't reach Google.
  Check the internet connection._ instead of `net::ERR_NAME_NOT_RESOLVED`.
  Sign-in, rate limit, refused request, server errors and failed files are
  covered too. The original error stays in the log and shows when you hover
  the Last sync row (#55).

For maintainers:

- `bun coverage` prints test coverage and fails below a floor; CI writes the
  report to the job summary (#53).

## v0.1.14 - 2026-09-23

- The line above the coffee button follows the last sync on this device:
  _It works! Coffee time?_ after a good sync, _Set it up, then let's talk
  coffee._ before the first one, and _Not working yet? Report it above._
  after a failure. It updates as soon as a sync ends (#51).

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
