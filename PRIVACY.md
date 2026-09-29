# Privacy

Short version: nothing about you or your notes is collected. Your files move
between your own device and your own Google Drive, and nowhere else.

## Your notes

Drive Bridge talks to two places: the Google Drive folder you point it at, and
a webhook URL if you configure one yourself. Nobody else receives your files,
file names, folder names or Google account.

- Files move between this device and **your** Google Drive, using **your** own
  OAuth client. The author has no access to any of it.
- Your Google client secret and refresh token are kept in the operating
  system's secure storage on each device, never in a synced file.
- **Export settings** shows the export in a window for you to copy, or saves it
  to a file in your vault, nowhere else. The Google account part is encrypted
  with your passphrase, or left out.
- The plugin never touches the clipboard. The sync log, the problem report and
  an export are shown in a window with **Select all**; copying is up to you.
- Files of this vault are read with Obsidian's own file API; the plugin makes
  no `fetch` call.
- **Sign in with Google** opens Google's own sign-in page in your browser.
  The address you paste back goes only to Google's token endpoint
  (`oauth2.googleapis.com`), with your client; no other server sees it.
- The plugin downloads no code at runtime; what ships in the release is all
  that runs.

## Network requests

Every request goes through Obsidian's `requestUrl`, to these addresses only:

| Address                                    | What for                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `www.googleapis.com/drive/v3/files`        | List, read, create, rename, trash and delete files and folders in your Drive folder                     |
| `www.googleapis.com/upload/drive/v3/files` | Upload file contents; large files in pieces                                                             |
| `www.googleapis.com/drive/v3/changes`      | Ask Drive what changed since the last sync, instead of listing everything                               |
| `www.googleapis.com/drive/v3/about`        | Your account's ID and email (to keep sync records per account), storage quota, and the connection check |
| `oauth2.googleapis.com/token`              | Finish **Sign in with Google** and refresh the access token                                             |
| The webhook URL you set                    | Only if you set one; see [Webhooks](#webhooks)                                                          |

The community directory counts these as separate calls in the code; they all
reach the addresses above.

## Links opened in the browser

Some buttons open a page in your browser. The plugin itself sends nothing to
these sites; the browser loads the page as it would any link.

- **Sign in with Google**: Google's sign-in page (`accounts.google.com`).
- The Google client setup steps: pages of the Google Cloud Console
  (`console.cloud.google.com`), to create the project and OAuth client.
- Help, **Report bug**, **Request feature** and **Star on GitHub**: this
  repository on `github.com`. The report links fill in the plugin version,
  the Obsidian version and the platform, for you to review before sending.
- **Buy me a coffee**: `buymeacoffee.com`.

## Base64

The directory notes that the code encodes and decodes base64 (`atob`,
`btoa`). It does so in three places, none of which hides a key, an address or
code:

- Reading a Google token pasted as the base64 block recent `rclone authorize`
  versions print.
- Making the random values of **Sign in with Google** (PKCE verifier,
  challenge and state), which Google expects in base64url.
- Storing the encrypted Google account part of **Export settings** as text.

## No analytics

There is no telemetry, no usage statistics, no crash reporting and no
analytics of any kind. The plugin never phones home, on any schedule, in any
build. Nothing counts how often you use it or whether you use it at all.

If you want to report a problem, **Settings → Drive Bridge → Export logs to
file** writes the sync log into your vault so you can read it and decide what
to share.

## Webhooks

If you fill in a webhook URL, the plugin POSTs to it when a sync starts and
finishes. That request carries the vault name, the time, the trigger and how
many operations ran, never file contents or names. It goes only to the
address you typed, over https. Leave the fields empty and nothing is sent.

## Questions

Open an issue: https://github.com/mmayadag/drive-bridge/issues
