# Drive Bridge

<p align="left">
<a href="https://github.com/mmayadag/drive-bridge/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/mmayadag/drive-bridge/ci.yml?branch=main&label=CI&logo=github"></a>
<a href="TECHNICAL.md#test-coverage"><img alt="Test coverage of every source file, at least 99%, enforced by CI" src="https://img.shields.io/badge/coverage-%E2%89%A599%25-brightgreen"></a>
<a href="https://github.com/mmayadag/drive-bridge/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/mmayadag/drive-bridge?label=release&logo=github"></a>
<a href="https://github.com/mmayadag/drive-bridge/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/mmayadag/drive-bridge/total?label=downloads&logo=github"></a>
<a href="https://obsidian.md"><img alt="Obsidian" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmmayadag%2Fdrive-bridge%2Fmain%2Fmanifest.json&query=%24.minAppVersion&label=Obsidian&color=7c3aed&logo=obsidian&logoColor=white"></a>
<a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white"></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/mmayadag/drive-bridge?label=license"></a>
<a href="https://buymeacoffee.com/muratmayadag"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?logo=buymeacoffee&logoColor=black"></a>
</p>

Two-way sync between your Obsidian vault and Google Drive, on desktop and on
iPhone and iPad. Built for a folder that other apps write to as well: an AI
assistant dropping notes in, a backup server reading them out.

- **No telemetry, no tracking.** Nothing about you, your notes or how you use
  Drive Bridge is ever sent to the author or any third party.
- **Your files go only between your device and your own Google Drive,**
  through your own Google client. No server of ours in between, and no code
  downloaded at runtime.

> [!WARNING]
> **Back up your vault before you use Drive Bridge.** Sync can delete or
> overwrite files on both sides, so keep a copy you can restore from.

## How it fits together

<p align="center"><img src="docs/how-it-works.svg" alt="Your vault and Google Drive, kept in step by Drive Bridge" width="760"></p>

Drive Bridge keeps your vault and one Google Drive folder in step, on every
device you install it on. Unlike plugins that only see the files they created,
it sees everything in the folder, so notes other tools write (an AI assistant,
a script, a teammate) show up like any other note. How they get into the folder
is up to them and Drive's sharing settings. Seeing more also means more can go
wrong, so safety comes first.

## Features

[Two-way sync](FEATURES.md#two-way-sync) ·
[Sees every file](FEATURES.md#sees-every-file) ·
[Nothing silently lost](FEATURES.md#nothing-silently-lost) ·
[Easy setup](FEATURES.md#easy-setup) ·
[Recovers on its own](FEATURES.md#recovers-on-its-own) ·
[Private by design](FEATURES.md#private-by-design)

## Install

Drive Bridge is not in Community plugins yet. Until it is, install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding
`mmayadag/drive-bridge` as a beta plugin; the steps are in
[TECHNICAL.md](TECHNICAL.md#install).

## Set up

1. Create a Google Cloud OAuth client (Desktop app) with the Drive API enabled.
2. On each device, open **Google account** in Drive Bridge settings, enter the
   client ID and secret, press **Sign in with Google**, and paste back the
   address the browser ends on. No terminal needed; a token from rclone works
   too.
3. Pick a Drive folder and run your first sync.

Step-by-step instructions and the reasoning behind each choice are in
[TECHNICAL.md](TECHNICAL.md#setup).

## Privacy

The only requests Drive Bridge makes are to Google, and to a webhook URL if you
set one yourself. It collects no usage statistics, has no analytics or crash
reporting, and writes to the clipboard only when you press a copy button.
Details in [PRIVACY.md](PRIVACY.md).

## Support

If the plugin saves you a headache, you can buy me a coffee. Contributions of
code and bug reports are welcome too, see
[CONTRIBUTORS.md](CONTRIBUTORS.md).

<p align="right">
Drive safe :)&nbsp;&nbsp;<a href="https://buymeacoffee.com/muratmayadag"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="48" align="absmiddle"></a>
</p>

## License

[MIT](LICENSE)

## Author

Murat Mayadağ
