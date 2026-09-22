# Drive Bridge — technical notes

## Setup

Do steps 1–3 once. Step 4 is repeated on every device.

### 1. Pick a Google account

Use a Google account dedicated to this vault, not your personal one. Drive
Bridge asks for full Drive access (see [below](#why-the-full-drive-scope)), so
a leaked token would expose everything in that account's Drive.

### 2. Create an OAuth client in Google Cloud

Sign in to [Google Cloud Console](https://console.cloud.google.com) with that
account.

1. **Create a project**: project picker → **New project**. Any name works.
2. **Enable the Drive API**: **APIs & Services → Library**, search for
   **Google Drive API**, open it and press **Enable**.
3. **Configure the consent screen**: **Google Auth Platform → Branding**. Fill
   in an app name (for example _Drive Bridge_) and your email as support and
   developer contact. Save.
4. **Set the audience**: **Google Auth Platform → Audience**. Choose
   **External**, then press **Publish app** so the status reads
   **In production**. In _Testing_ status refresh tokens expire after 7 days
   and sync stops.
5. **Create the client**: **Google Auth Platform → Clients → Create client**.
   Application type **Desktop app**, any name. Copy the **client ID** and
   **client secret**; you need both in the next steps.

You do not need to submit the app for verification. It is only used by you.

### 3. Get a refresh token

On a computer with [rclone](https://rclone.org/downloads/) installed:

```bash
rclone authorize "drive" "<client ID>" "<client secret>"
```

1. A browser opens. Sign in with the account from step 1.
2. Google warns that the app is not verified. Press **Advanced → Go to
   <app name> (unsafe)**. This is your own client, so the warning is expected.
3. Approve access to Google Drive.
4. Back in the terminal, rclone prints the token between
   `Paste the following into your remote machine --->` and `<---End paste`.
   Recent rclone versions print a long string starting with `eyJ`; older ones
   print a JSON object. Copy exactly what is between the two markers. Drive
   Bridge accepts either form.

`"drive"` without further options asks for the full `drive` scope, which is
what Drive Bridge needs. The same token also works for the backup server's
rclone remote.

Treat the token like a password. Anyone holding it together with the client
ID and secret can read and change the whole Drive of that account.

### 4. Connect each device

In Obsidian, install Drive Bridge (see the README), then open
**Settings → Drive Bridge**:

1. **Backend**: choose **Google Drive**.
2. **OAuth client ID**: paste the client ID.
3. **OAuth client secret**: paste the client secret. It is stored in the
   device's secure storage, not in synced files.
4. **Connect account**: paste the token from step 3 (the `eyJ…` string, the
   JSON, or only its `refresh_token` value) and press **Connect**.
5. **Base directory**: the Drive folder for this vault. It defaults to the
   vault name and is created on the first sync. Every device syncing the same
   vault must use the same folder.
6. Run the first sync from the command palette or the ribbon icon and review
   the tasks before confirming.

Connect verifies the token before saving anything. It gets an access token
with your client, checks that the grant is full `drive` rather than
`drive.file`, and reads the account. On success the settings show
_Connected as <email>_. The check button next to **Backend** keeps testing
access afterwards.

The same token can be used on every device. **Forget on this device** only
removes it locally. To revoke it everywhere, remove the app under
Google Account → Security → Third-party access; every device then needs a new
token.

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

| Path               | Contents                                            |
| ------------------ | --------------------------------------------------- |
| `src/`             | Plugin core: sync logic, settings, UI               |
| `src/gdrive/`      | Google Drive backend                                |
| `src/smart-merge/` | Three-way text merge                                |
| `src/shared/`      | Shared utilities and storage                        |
| `test/`            | Tests, mirroring `src/`; helpers in `test/support/` |

### Test vault

A throwaway vault on your computer that loads the plugin straight from
`dist/`. Use a test Google account and a test Drive folder.

```bash
REPO=~/Desktop/obsidian/drive-bridge   # this repository
VAULT=~/Desktop/drive-bridge-test      # any empty folder
PLUGIN="$VAULT/.obsidian/plugins/drive-bridge"

cd "$REPO" && bun run build
mkdir -p "$PLUGIN"
for f in main.js manifest.json styles.css; do ln -sf "$REPO/dist/$f" "$PLUGIN/$f"; done
echo '["drive-bridge"]' > "$VAULT/.obsidian/community-plugins.json"
printf '# Welcome\n\nTest note.\n' > "$VAULT/Welcome.md"
```

The three build outputs are linked one by one instead of linking the whole
folder. The build clears `dist/`, and Obsidian writes the plugin's
`data.json` next to `main.js`; linking the folder would wipe your settings on
every build.

Then in Obsidian: **Open folder as vault**, pick the folder, answer
**Trust author and enable plugins**, and follow [Connect each
device](#4-connect-each-device).

### Development loop

```bash
bun dev   # rebuilds dist/ on every change, unminified with source maps
```

After a rebuild, run **Reload app without saving** from the command palette
to load the new code. The developer console (**Cmd+Option+I**) shows errors
and the plugin's log output.

### First run checklist

Things that are easy to break and not covered by unit tests:

- **Settings**: client ID and secret save on blur; Connect with an empty
  client shows a notice; a malformed token is rejected; a `drive.file` token
  is rejected with a clear message; a good token shows _Connected as_;
  **Forget on this device** returns to the Connect row.
- **Connection check**: the icon next to **Backend** spins, then turns green,
  or red when offline.
- **Confirm dialog**: the file tree renders with icons and indentation;
  **Select all** toggles everything and shows a mixed state when partly
  selected; deselected rows are dimmed.
- **Progress**: the modal shows progress and counts; failed tasks list with
  their error; the status bar text and the spinning ribbon icon reset when
  idle.
- **Round trip**: a note created in Obsidian appears in Drive; a Markdown file
  uploaded to the Drive folder by another app appears in the vault; edits on
  both sides produce a merge or a kept copy, never a silent overwrite.

### Releasing

1. Bump `version` in `manifest.json`, then run `bun ver`.
2. Add a `## vX.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`.
3. Push a `X.Y.Z` tag. CI builds the plugin, attests the build and attaches
   `main.js`, `manifest.json` and `styles.css` to the GitHub release, which is
   what BRAT installs from. Tags containing `-` become pre-releases.
