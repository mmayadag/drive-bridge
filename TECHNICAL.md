# Drive Bridge technical notes

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

Drive Bridge does not run a sign-in flow itself (see [why](#why-not-an-in-plugin-sign-in)).
You obtain a refresh token once and paste it into each device. Pick whichever
method suits you; all three end with the same kind of token.

In every method Google warns that the app is not verified. Press
**Advanced → Go to \<app name\> (unsafe)**: it is your own client, so the
warning is expected.

Treat the result like a password. Anyone holding it together with the client
ID and secret can read and change the whole Drive of that account.

#### Method 1: rclone (simplest)

On a computer with [rclone](https://rclone.org/downloads/) installed:

```bash
rclone authorize "drive" "<client ID>" "<client secret>"
```

A browser opens; sign in with the account from step 1 and approve. rclone then
prints the token between `Paste the following into your remote machine --->`
and `<---End paste`. Recent versions print a long string starting with `eyJ`,
older ones a JSON object; Drive Bridge accepts either.

`"drive"` without further options asks for the full `drive` scope, which is
what Drive Bridge needs. The same token also works as the remote for a backup
server running rclone.

#### Method 2: browser and curl (no rclone)

1. Open this URL in a browser, with your client ID filled in:

   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=<client ID>&redirect_uri=http://127.0.0.1:53682&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent
   ```

2. Approve access. The browser then fails to load a `127.0.0.1` page, and that is
   expected, nothing is listening there. What matters is the address bar:

   ```
   http://127.0.0.1:53682/?code=4/0AX4...&scope=https://www.googleapis.com/auth/drive
   ```

3. Copy the value of `code=` (everything up to the next `&`).
4. Exchange it for a token, within a few minutes:

   ```bash
   curl -s https://oauth2.googleapis.com/token \
     --data-urlencode "client_id=<client ID>" \
     --data-urlencode "client_secret=<client secret>" \
     --data-urlencode "code=<the code>" \
     --data-urlencode "grant_type=authorization_code" \
     --data-urlencode "redirect_uri=http://127.0.0.1:53682"
   ```

5. The response is JSON containing `refresh_token`. Paste the whole response,
   or just that value, into Drive Bridge.

`access_type=offline` and `prompt=consent` are what make Google return a
refresh token; without them you only get an access token that expires in an
hour.

#### Method 3: reuse a token you already have

A refresh token is not tied to a device. If you already connected one device,
or set up a backup server with rclone using the same client, that token works
everywhere. Copy it from the other machine's `rclone.conf` instead of creating
a new one.

Google allows up to 100 live refresh tokens per client and account; creating
the 101st quietly invalidates the oldest. Reusing one token avoids ever
thinking about that limit.

### 4. Connect each device

In Obsidian, install Drive Bridge (see the README), then open
**Settings → Drive Bridge**:

1. Open **Google account** under Google Drive (it reads _Tap to connect_ or _Click to connect_) and
   paste the **OAuth client ID**.
2. On the same page, paste the **OAuth client secret**. It is stored in the
   device's secure storage, not in synced files.
3. **Connect account**, also on that page: paste the token from step 3 above
   (the `eyJ…` string, the JSON, or only its `refresh_token` value) and press
   **Connect**.
4. **Base directory**: the Drive folder for this vault. It defaults to the
   vault name and is created on the first sync. Every device syncing the same
   vault must use the same folder.
5. Run the first sync from the command palette or the ribbon icon and review
   the tasks before confirming.

Connect verifies the token before saving anything. It gets an access token
with your client, checks that the grant is full `drive` rather than
`drive.file`, and reads the account. On success the **Google account** entry
shows the email, and its page keeps only _Connected as <email>_ and
**Forget on this device**; the client fields return after forgetting. The
check icon on the _Connected as_ row keeps testing access afterwards.

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
another app puts in the same folder stay invisible. No error, they just
never sync. Full `drive` scope is what lets Drive Bridge see them.

The trade-off: a leaked token opens the whole Drive of that account. Use a
Google account dedicated to your vault, not your personal one.

## Security model

| Rule                          | How                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| No remote code                | The plugin never downloads or evaluates code at runtime. All modules are bundled at build time. |
| No third-party servers        | Network calls go only to Google, plus any webhook URL you configure yourself.                   |
| No credentials in the release | You bring your own OAuth client; nothing is compiled in.                                        |
| Secrets off disk              | Client secret and refresh token live in Obsidian's secret storage, not in `data.json`.          |

`data.json` holds settings and the client ID, no secrets. The default
exclusion rules skip the whole config folder (`.obsidian/`), so plugin
settings and the device-specific workspace files never sync. If you keep the
vault in git or another sync tool as well, exclude them there too:

```
.obsidian/plugins/drive-bridge/data.json
.obsidian/workspace.json
.obsidian/workspace-mobile.json
```

## How it works

### Pieces

```mermaid
flowchart LR
    subgraph Device["Obsidian (each device)"]
        Vault[("Vault files")]
        VaultFs["Local file system<br/>(vault adapter)"]
        Engine["Sync engine<br/>list · decide · run tasks"]
        DriveFs["Google Drive file system<br/>(paths ↔ Drive file ids)"]
        MW["Request pipeline<br/>bearer token · retry · rate limit"]
        IDB[("IndexedDB<br/>sync records per account<br/>merge base texts")]
        Secret[("Secret storage<br/>client secret · refresh token")]
        Data[("data.json<br/>settings · client ID")]
    end
    Drive[("Google Drive<br/>base directory")]
    Other["Other apps<br/>(AI assistant, backup server)"]

    Vault <--> VaultFs <--> Engine <--> DriveFs --> MW --> Drive
    Engine <--> IDB
    MW -.-> Secret
    Other <--> Drive
```

The engine only ever talks to two file systems: the vault and the Drive
folder. Everything else is a wrapper around one of them (cancellation, memory
limits, the base-directory prefix, smart merge's base-text capture) or around
the HTTP request (access token, retry, rate limit). The **records** in
IndexedDB remember what each file looked like on both sides after the last
successful sync; they are what turns "the file differs" into "this side
changed".

### One sync

```mermaid
flowchart TD
    T["Trigger<br/>manual · realtime · startup · scheduled"] --> L
    L["List vault and Drive in parallel<br/>apply inclusion / exclusion rules"] --> R
    R["Load records from IndexedDB"] --> D
    D["Decide per path<br/>(table below)"] --> M
    M["Detect moves<br/>delete + create of the same file → move"] --> C
    C{"Confirm?"}
    C -->|"manual sync"| C1["Review all planned changes"]
    C -->|"automatic sync with local deletions"| C2["Confirm deletions<br/>or re-upload instead"]
    C -->|"otherwise"| X
    C1 --> X
    C2 --> X
    X["Run tasks in parallel<br/>upload · download · mkdir · move · remove · resolve conflict"] --> U
    U["Each finished task updates its record"] --> S
    S["Report: completed · failed · cancelled"]
```

Sync requests that arrive while a sync is running are queued and merged into
one run with the options of the strongest trigger (manual, then startup, then
scheduled, then realtime). Realtime syncs in fast mode skip the Drive scan
and reuse the last listing, so remote changes arrive with the next full sync.
A failed task leaves its record untouched, so the next sync retries it.

### Deciding a file

"Changed" means different from the record, i.e. from the last sync.

| Record | Vault | Drive | Action                                                                                     |
| ------ | ----- | ----- | ------------------------------------------------------------------------------------------ |
| no     | yes   | no    | Upload                                                                                     |
| no     | no    | yes   | Download                                                                                   |
| no     | yes   | yes   | Same size: just record it. Otherwise: resolve conflict                                     |
| yes    | yes   | yes   | Only Drive changed: download · only vault changed: upload · both changed: resolve conflict |
| yes    | yes   | no    | Vault changed: upload again · unchanged: delete from vault (confirmed in auto-sync)        |
| yes    | no    | yes   | Drive changed: download again · unchanged: delete from Drive                               |
| yes    | no    | no    | Forget the record                                                                          |

Folders follow the same idea. A deleted folder is only removed on the other
side if nothing inside it changed since the last sync; otherwise it is
recreated.

### Sync strategies

The sync strategy decides which operations a sync plans. It is a per-device
setting, stored in the plugin's own settings and never uploaded, so two
devices can disagree. In normal use every device should stay on
_Bidirectional_.

| Strategy          | What a sync does                                                                                                                                                              | Deletes                                                                                       | When to use it                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Bidirectional** | Compares vault, Drive and the record of the last sync, then moves each file in whichever direction changed. Changes on both sides go to the conflict resolve strategy.        | Both ways. A file deleted on one side and unchanged on the other is deleted on the other too. | Always, unless you are repairing something.                                           |
| **Mirror local**  | Makes Drive an exact copy of the vault. Every file is uploaded; anything on Drive that is not in the vault is deleted. Nothing is ever downloaded and no conflict can happen. | Remote only, and without asking.                                                              | Once, to push a known-good vault over a damaged Drive folder. Switch back afterwards. |
| **Mirror remote** | Makes the vault an exact copy of Drive. Every file is downloaded; anything in the vault that is not on Drive is deleted. Nothing is ever uploaded and no conflict can happen. | Local only, and without asking.                                                               | Once, to restore a device from Drive. Switch back afterwards.                         |

Both mirrors still go through the usual safety nets: a manual sync lists every
operation first while _Confirm operations in manual sync_ is on, and vault
deletions are confirmed in automatic syncs while _Confirm deletions during
auto-sync_ is on. Deletions on the Drive side are never confirmed, which is
true of _Bidirectional_ as well. Drive deletions land in Drive's trash while
_Delete to trash_ is on, and vault deletions follow Obsidian's own trash
setting (system trash, the vault's `.trash` folder, or permanent).

Pick the source side carefully: _Mirror remote_ on a device whose vault is the
only good copy overwrites that copy with whatever Drive happens to hold.

A mirror run is not free: it compares sizes and recorded ids first, so files
that already match are only recorded, not transferred again.

### Conflict resolve strategies

A conflict is one specific situation: both the vault copy and the Drive copy
changed since the last sync, so neither can be called the newer state of the
same edit. Only _Bidirectional_ produces conflicts. The strategy is also
per-device, so if two devices resolve the same conflict differently the vault
ends up with whatever each device decided.

| Strategy                 | What happens to your two versions                                                                                                                                           | Anything lost?                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Rename and keep both** | If the bytes are identical, nothing happens. Otherwise the version with the newer modified time keeps the name and the other is saved as `note.conflict.md`, on both sides. | No.                                                   |
| **Smart merge**          | Three-way merge of the two versions against the copy from the last sync. Non-overlapping edits are combined; overlapping ones are kept side by side and marked in the text. | No, but the merged file needs a read-through.         |
| **Latest survives**      | The version with the newer modified time is copied over the other one.                                                                                                      | Yes, the older version, without a prompt.             |
| **Keep local**           | The vault version is uploaded over the Drive version.                                                                                                                       | Yes, the Drive version.                               |
| **Keep remote**          | The Drive version is downloaded over the vault version.                                                                                                                     | Yes, the vault version.                               |
| **Skip**                 | Nothing. The file is left alone on both sides and no record is written, so the next sync sees the same conflict again.                                                      | No, but the two sides stay out of sync until you act. |

Notes that matter in practice:

- Modified times come from two different machines. A device with a wrong clock
  can make an old edit look newer, which is why _Latest survives_ is not the
  default.
- **Smart merge** only works on `.md` and `.markdown` files and only with a
  base to merge against. It keeps a copy of every synced markdown file while
  it is the selected strategy, so it has no base for files synced before you
  turned it on, and for those it falls back to _Rename and keep both_. Binary
  files always fall back too.
- Smart merge writes the overlapping parts wrapped in `<mark>` tags, which
  render as highlights in Obsidian. The tags are configurable under
  _Miscellaneous_.
- _Skip_ is the safe choice while you investigate: it never writes, but the
  conflict is reported on every sync until the strategy changes or one side
  stops differing.

## Settings

Defaults are what a fresh install uses. _Recommended_ is for a vault that
other apps also write to (for example an AI assistant writing into an inbox
folder); for a vault only you edit, the defaults are fine except where noted.

Two labels appear next to some setting names; hold or hover one to see its
meaning:

- **Match**: keep this setting the same on every device.
- **Speed**: tuning this setting can make syncs faster.

The main screen shows Last sync, Sync strategy, Conflict resolve strategy and
the Google Drive group, and ends with [Support](#support). Everything else is
one tap away:

| Entry          | Holds                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Automatic sync | [Features](#features); the entry shows how many are on                                                                  |
| Filter rules   | [Filter rules](#filter-rules); the entry shows the rule count                                                           |
| Advanced       | [Controls](#controls), [Miscellaneous](#miscellaneous), Smart merge, [Webhooks](#webhooks), [Development](#development) |

### General

| Setting                   | Default              | Recommended          | What it does                                                                                                                                                                                                                  |
| ------------------------- | -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last sync                 | none                 | none                 | When this device last synced and how it ended, with a **Start sync** button that runs one now (greyed out while a sync is running).                                                                                           |
| Storage backend           | Google Drive         | Google Drive         | The only backend, so the row is hidden. It appears once a second backend exists. The connection check is on the Google account page.                                                                                          |
| Sync strategy             | Bidirectional        | Bidirectional        | Which direction files move in. _Mirror local_ / _Mirror remote_ make one side an exact copy of the other and delete the rest, so keep them for repairs. See [Sync strategies](#sync-strategies).                              |
| Conflict resolve strategy | Rename and keep both | Rename and keep both | What happens when both sides changed the same file. The default keeps both versions; _Latest survives_, _Keep local_ and _Keep remote_ silently discard one. See [Conflict resolve strategies](#conflict-resolve-strategies). |

### Google Drive

| Setting             | Default       | Recommended          | What it does                                                                                                                                                                          |
| ------------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google account      | Not connected | your account         | Sub-page with the whole account setup. The entry shows the connected email, or what to do next (_Tap/Click to connect_, _Client secret missing_, _Client ID missing_) with a warning. |
| OAuth client ID     | none          | your client          | On the Google account page. See [Setup](#setup). Saved in plugin settings. Hidden once connected.                                                                                     |
| OAuth client secret | none          | your client          | On the Google account page. Saved in the device's secure storage. Hidden once connected.                                                                                              |
| Connect account     | none          | token from rclone    | On the Google account page. Verified before saving. Connect points at the first field still empty instead of calling Google.                                                          |
| Base directory      | vault name    | same on every device | Drive folder that holds the vault. The folder button next to it browses your Drive and can create a folder. Every device syncing this vault must use the same one.                    |
| Delete to trash     | on            | on                   | Deletions go to Drive's trash (kept 30 days) instead of being permanent.                                                                                                              |

### Features

| Setting                    | Default    | Recommended               | What it does                                                                                                                                                                                |
| -------------------------- | ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realtime sync              | off, 5 s   | desktop: on · mobile: off | Syncs shortly after you edit a file.                                                                                                                                                        |
| Realtime sync fast mode    | on         | on                        | Realtime syncs reuse the last remote listing instead of scanning Drive, so they only push your own changes. Remote changes arrive with the next startup, scheduled or manual sync.          |
| Sync when leaving Obsidian | on         | on                        | Syncs as soon as Obsidian goes to the background or loses focus, but only if files changed since the last sync. On mobile this is what pushes a note you just wrote before you switch apps. |
| Startup sync               | on, 5 s    | on                        | Syncs once after Obsidian starts.                                                                                                                                                           |
| Scheduled sync             | on, 15 min | on, 5–15 min              | Periodic full sync; this is what picks up files other apps add to Drive.                                                                                                                    |

### Controls

| Setting                 | Default    | Recommended | What it does                                                              |
| ----------------------- | ---------- | ----------- | ------------------------------------------------------------------------- |
| Max file size           | off, 30 MB | off         | Skips files above the limit.                                              |
| Max request concurrency | on, 50     | on, 50      | Parallel requests. Lower it (e.g. 10) if you see Drive rate-limit errors. |
| Min request interval    | off        | off         | Minimum pause between requests.                                           |
| Max memory consumption  | on, 100 MB | on, 100 MB  | Caps memory used for file contents during a sync; lower on old phones.    |

### Filter rules

| Setting         | Default                                                                              | Recommended | What it does                                       |
| --------------- | ------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------- |
| Exclusion rules | VCS folders, `node_modules`, OS junk files, Office lock files, `.trash`, `.obsidian` | defaults    | Glob patterns that are never synced.               |
| Inclusion rules | none                                                                                 | none        | Patterns synced even if an exclusion rule matches. |

### Miscellaneous

| Setting                            | Default | Recommended | What it does                                                                                                                                                                    |
| ---------------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom headers                     | none    | none        | Extra HTTP headers; not needed for Google Drive.                                                                                                                                |
| Notice sync status on mobile       | on      | on          | Shows progress as a notice on mobile.                                                                                                                                           |
| Avoid auto sync when offline       | on      | on          | Skips automatic syncs without a connection.                                                                                                                                     |
| Confirm operations in manual sync  | on      | on          | Lists the planned changes before a manual sync runs.                                                                                                                            |
| Confirm deletions during auto-sync | on      | **on**      | Before an automatic sync deletes local files (because they were deleted in Drive), asks first; you can re-upload instead. This is the guard against another app deleting notes. |

### Webhooks

| Setting                | Default | Recommended | What it does                                                                                                                         |
| ---------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Before a sync          | empty   | empty       | POSTs `{event, vault, at, trigger, tasks?}` as JSON when a sync starts. `https` only; logs show the origin, never the path or query. |
| After a sync           | empty   | empty       | POSTs `{event, vault, at, result, completed, failed, error?}` when it ends.                                                          |
| Only when files change | on      | on          | Skips both webhooks when a sync finds nothing to do, and holds the start until the sync has planned work.                            |

Both are off while empty. Failures are logged and never stop a sync. Whatever
you put here receives requests from your devices, so use an endpoint you
trust; the payload carries the vault name, not its contents.

### Support

| Setting          | What it does                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Help and support | Three icons: the setup guide, a bug report and a feature request. Both reports open GitHub's issue form with the plugin version, Obsidian version and platform filled in. Nothing leaves the device until you submit the form yourself. |
| Buy me a coffee  | The yellow footer at the bottom of the settings; opens the donation page. The version below it is the installed plugin version.                                                                                                         |

### Development

| Setting             | What it does                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Clear records       | Forgets what was synced before. The next sync treats every file present on both sides as a conflict or a new file. Only for recovery. |
| Export logs to file | Writes the sync log into the vault for troubleshooting.                                                                               |

## Sync behavior

- **Conflicts:** both versions are kept by default (`renameAndKeepBoth`); the
  alternatives are described under
  [Conflict resolve strategies](#conflict-resolve-strategies).
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
- **Connection check**: the icon on the _Connected as_ row (Google account
  page) spins, then turns green,
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

1. Run `bun ver X.Y.Z`. It adds an empty `## vX.Y.Z - YYYY-MM-DD` section to
   `CHANGELOG.md` and stops; write the notes there. `bun changelog X.Y.Z`
   prints a draft from the milestone's closed issues (needs the GitHub CLI).
2. Run `bun ver X.Y.Z` again. It sets the version in `manifest.json` and
   `package.json`, adds it to `versions.json` with the current
   `minAppVersion`, and prints the commit, tag and push commands.
3. Push the `X.Y.Z` tag. CI checks that the tag and release files agree
   (`bun ver --check <tag>`), builds the plugin, attests the build and attaches
   `main.js`, `manifest.json` and `styles.css` to the GitHub release, which is
   what BRAT installs from. Tags containing `-` become pre-releases.
