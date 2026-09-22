# Drive Bridge

Two-way sync between your Obsidian vault and Google Drive — built to stay safe
when other apps write to the same folders.

> **Status:** early development. Not ready for your real vault yet.

## Why

Most Drive plugins only see the files they created themselves. Drive Bridge
sees everything in its folder, so notes written by other tools (an AI
assistant, a script, a teammate) show up in your vault like any other note.

Seeing more also means more can go wrong, so safety comes first:

- **Nothing is silently lost.** Conflicting edits are merged or kept side by
  side, never overwritten.
- **Deletes are confirmed.** Remote deletions ask before touching your vault.
- **No remote code.** Everything the plugin runs is in this repository.
- **Your credentials stay yours.** Bring your own Google Cloud client; the
  refresh token lives in the OS keychain, not in synced files.

## Install

Drive Bridge is not in the community store. Install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT.
2. BRAT → **Add beta plugin** → `https://github.com/mmayadag/drive-bridge`
3. Enable **Drive Bridge** in Community plugins.

## Set up

1. Create a Google Cloud OAuth client with the Drive API enabled.
2. Paste the client ID and secret into Drive Bridge settings.
3. Sign in, pick a Drive folder, run your first sync.

Step-by-step instructions and the reasoning behind each choice are in
[TECHNICAL.md](TECHNICAL.md).

Drive safe :)

## License

[MIT](LICENSE)
