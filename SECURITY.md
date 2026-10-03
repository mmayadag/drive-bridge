# Security policy

## Supported versions

Fixes go into the latest release. A pre-release (`x.y.z-beta.n`) is fixed in
the next release, not patched in place.

## Reporting a vulnerability

Report it privately from this repository's **Security** tab → **Report a
vulnerability**. Please do not open a public issue or discussion.

Include the Drive Bridge and Obsidian versions, the platform (desktop or
mobile), the steps to reproduce and what an attacker gains. Never paste a
refresh token, client secret or settings export into a report.

You will get an answer within 7 days. Fixes are prioritized by impact; there
is no fixed deadline.

## Scope

In scope: anything in the plugin that exposes the refresh token or client
secret (written in plain text to a file, a log or a report), weakens
the encryption of a settings export, sends data anywhere other than Google,
or runs code that is not part of the release.

Out of scope: the security of the Google account itself, a misconfigured
OAuth client of your own, Obsidian itself, webhook URLs you configure, and a
token or secret that left your hands some other way (pasted somewhere, an
export shared with its passphrase, a lost device). Drive Bridge ships no
credentials and has no access to your Google account or client, so only you
can revoke them; the steps are below.

The design rules are in [TECHNICAL.md](TECHNICAL.md#security-model) and every
address the plugin calls is in [PRIVACY.md](PRIVACY.md).

## Verifying a release

Each release file is built and attested by this repository's release
workflow. With the GitHub CLI signed in:

```bash
gh attestation verify main.js --repo mmayadag/drive-bridge
```

## If your own token or client secret leaks

1. In your Google account, under third-party connections, remove access for
   your OAuth client. This invalidates every refresh token it issued, on
   every device.
2. In Google Cloud Console, create a new client secret for the client and
   delete the old one.
3. On each device, enter the new secret and connect again. **Forget on this
   device** alone only deletes the local copy; it revokes nothing.
