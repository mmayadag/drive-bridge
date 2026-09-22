# Drive Bridge — technical notes

## Google Cloud setup

1. Create a new project in Google Cloud Console and enable the **Google Drive
   API**.
2. Create an **OAuth client** of type **Desktop app**.
3. Set the app's publishing status to **In production**. In Testing mode
   refresh tokens expire after 7 days. The "unverified app" warning on the
   consent screen is expected for a personal client; continue via
   **Advanced**.

## Signing in

Drive Bridge does not run a sign-in flow itself. Get a refresh token once on a
computer:

```bash
rclone authorize "drive" "<client ID>" "<client secret>"
```

rclone opens the browser, you approve, and it prints a JSON token. Then on
every device, in Drive Bridge settings:

1. Enter the **client ID** and **client secret**.
2. Paste the token (the whole JSON or just the `refresh_token` value) and
   press **Connect**.

Connect checks the token right away: it gets an access token with your
client, makes sure the grant is full `drive` rather than `drive.file`, and
reads the account. If any step fails nothing is saved. Afterwards the
account's email is shown in settings, and the connection check next to the
backend setting keeps testing access.

The same token can be used on every device and on the backup server.
**Forget on this device** only removes it locally. To revoke it everywhere,
remove the app under Google Account → Security → Third-party access.

### Why not an in-plugin sign-in

Google's device flow (enter a code on another screen) only allows
`drive.file`. A browser redirect to a local server works on desktop but not on
mobile. Pasting a token works everywhere and keeps the plugin free of any
local server code.

### Why the full `drive` scope

`drive.file` only grants access to files the app created itself. Files
another app puts in the same folder stay invisible — no error, they just
never sync. Full `drive` scope is what lets Drive Bridge see them.

The trade-off: a leaked token opens the whole Drive of that account. Use a
Google account dedicated to your vault, not your personal one.

## Security model

| Rule                          | How                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| No remote code                | The plugin never downloads or evaluates code at runtime. All modules are bundled at build time. |
| No third-party servers        | Network calls go only to `googleapis.com` and `oauth2.googleapis.com`.                          |
| No credentials in the release | You bring your own OAuth client; nothing is compiled in.                                        |
| Secrets off disk              | Client secret and refresh token live in Obsidian's secret storage, not in `data.json`.          |

`data.json` holds settings and the client ID, no secrets. Still keep it and the
workspace files out of any sync or git:

```
.obsidian/plugins/drive-bridge/data.json
.obsidian/workspace.json
.obsidian/workspace-mobile.json
```

The workspace files are device-specific; syncing them makes devices overwrite
each other's layout.

## Sync behavior

- **Conflicts:** three-way merge for text when a common base is known;
  otherwise both versions are kept (`renameAndKeepBoth`).
- **Deletes:** remote deletions require confirmation during automatic sync
  (`confirmDeleteInAutoSync`).
- **Layout:** one vault maps to one Drive folder (`baseDirectory`). Listing is
  parent-based, so the real folder structure is mirrored.

### Known limits

- Drive has no conditional write (If-Match) for `files.update`. A write racing
  another app's write to the same file is detected on the next sync, not
  prevented.
- Drive revisions and trash are not a history. Keep a separate backup.

## Development

Requires [Bun](https://bun.sh) 1.4.2 or later.

```bash
bun install
bun run build          # output: dist/
bun tests              # all tests (not `bun test`)
bun check              # types, lint, format
bun fix                # auto-fix lint and format
```

### Repository layout

| Path               | Contents                              |
| ------------------ | ------------------------------------- |
| `src/`             | Plugin core: sync logic, settings, UI |
| `src/gdrive/`      | Google Drive backend                  |
| `src/smart-merge/` | Three-way text merge                  |
| `src/shared/`      | Shared utilities and storage          |
| `test/`            | Tests; `test/mocks.ts` mocks Obsidian |

### Releasing

1. Bump `version` in `manifest.json`, then run `bun ver`.
2. Add a `## vX.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`.
3. Push a `X.Y.Z` tag. CI builds the plugin, attests the build and attaches
   `main.js`, `manifest.json` and `styles.css` to the GitHub release, which is
   what BRAT installs from. Tags containing `-` become pre-releases.
