# Privacy

Short version: nothing about you or your notes is collected. Your files move
between this device and your own Google Drive, and nowhere else.

## Your notes

Drive Bridge talks to two places: the Google Drive folder you point it at, and
a webhook URL if you configure one yourself. Nobody else receives your files,
file names, folder names or Google account.

- Files move between this device and **your** Google Drive, using **your** own
  OAuth client. The author has no access to any of it.
- Your Google client secret and refresh token are kept in the operating
  system's secure storage on each device, never in a synced file.
- **Sign in with Google** opens Google's own sign-in page in your browser.
  The address you paste back goes only to Google's token endpoint
  (`oauth2.googleapis.com`), with your client; no other server sees it.
- The plugin downloads no code at runtime; what ships in the release is all
  that runs.

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
