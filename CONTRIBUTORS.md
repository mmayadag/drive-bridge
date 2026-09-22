# Contributors

## Maintainer

- **Murat Mayadağ** ([@mmayadag](https://github.com/mmayadag)), author and maintainer

## Contributing

Bug reports, ideas and pull requests are welcome. Before opening a pull
request:

1. Read [AGENTS.md](AGENTS.md) for the conventions this codebase follows:
   kebab-case file names, no runtime code downloads, no Node.js APIs, and no
   network calls beyond Google and a webhook the user configures.
2. Run `bun fix` and then `bun check` and `bun tests`. Everything must pass,
   including zero lint warnings.
3. Cover new behavior with a test next to the file it belongs to
   (`src/gdrive/auth.ts` → `test/gdrive/auth.test.ts`).
4. Describe what changes for the person using the plugin, not only what
   changed in the code.

Everyone who lands a change is listed here.

## Third-party code

Some files carry copyright notices from the open source work they came from,
all MIT licensed:

- `src/smart-merge/diff3/`: the three-way merge, with notices for Tony
  Garnock-Jones, LShift Ltd., Axosoft (GitKraken) and others.
- [NOTICE](NOTICE) carries the notice that covers the rest.

Keep those notices in place when you change those files.
