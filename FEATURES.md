# Features

A closer look at what Drive Bridge does. Setup steps and every setting are in
[TECHNICAL.md](TECHNICAL.md).

## Two-way sync

Your vault and one Google Drive folder stay in step, on desktop and on phones.
Syncs run on startup, on a schedule, when you leave Obsidian, as you edit
(realtime), or by hand from the ribbon, the command palette or the settings.
_Sync this file_ syncs just the open note, from its header or the file menu.
A manual sync can list every planned change for you to confirm first.
On a large Drive, _Changes only_ asks Drive what changed instead of listing
everything each time, with a full scan once a day to be safe.
Details: [Sync strategies](TECHNICAL.md#sync-strategies),
[Sync behavior](TECHNICAL.md#sync-behavior).

## Sees every file

Most Drive plugins only see files they created themselves. Drive Bridge uses
full Drive access, so anything that lands in its folder, from an AI assistant,
a script, a teammate or a backup job, comes into your vault on the next sync.
Filter rules decide what is left out. Details:
[Why the full `drive` scope](TECHNICAL.md#why-the-full-drive-scope).

## Nothing silently lost

- Conflicting edits keep both versions (`note.md` and `note.conflict.md`), or
  are merged with Smart merge. Strategies that replace a version are marked
  with a warning.
- A sync that would delete more than 50 files, or 5% of the vault, stops and
  asks. _Keep them_ copies each file back.
- Vault deletions are confirmed in automatic syncs, and deleted files go to
  the trash on both sides.
- _Never delete on Drive_ keeps Drive as an archive of everything.
- No frontmatter, tags or markers are ever added to your notes.

Details: [Conflict resolve strategies](TECHNICAL.md#conflict-resolve-strategies).

## Easy setup

- A guided list of the four one-time Google Cloud steps, each with a button to
  its page; pasting the downloaded client file fills in the ID and secret.
- **Sign in with Google** in the settings, on desktop and on phones. No
  terminal needed.
- **Export settings** on one device and **Import settings** on the next: the
  Google account travels encrypted with your passphrase.

Details: [Setup](TECHNICAL.md#setup).

## Recovers on its own

- An interrupted sync (Obsidian closed, offline, cancelled) picks up where it
  stopped.
- Requests to Google are retried with backoff.
- A file that keeps failing is skipped and named instead of blocking the rest,
  and can be retried later.
- Last sync shows the result in plain words, such as _Can't reach Google_.
  The last 30 syncs are listed with what moved, and the log opens in a window.

## Private by design

- Your own Google Cloud client; nothing is compiled into the plugin.
- The client secret and refresh token stay in the device's secure storage,
  never in synced files.
- Requests go only to Google, plus a webhook URL if you set one.
- No telemetry, no analytics, no code downloaded at runtime.

Details: [PRIVACY.md](PRIVACY.md), [Security model](TECHNICAL.md#security-model).
