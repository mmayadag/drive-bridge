# Drive Bridge

This is the repository for Drive Bridge, an Obsidian plugin that syncs vault files with Google Drive. All source code is in `src/`, tests in `test/`. User-facing overview is in `README.md`, technical notes in `TECHNICAL.md`.

## Context

- When exploring the repo, you must read related pages in `docs/src/pages/en/`, especially inside the `deep-dive/` folder: this is the fastest way to understand the engineering sophistication.
- This repo is also an Obsidian vault used for testing. The config folder is at `.obsidian`, and plugin dist folder is symlinked to `.obsidian/plugins/drive-bridge`. The folder also contains plugin settings in `data.json` and module binaries.
- `./test-files` are and are the only files used for local sync testing. You can do anything inside the folder without caring about changes or losses.

## Techstack

- **TypeScript 6** as programming language
- **Bun** as its package manager and task runner
- **esbuild** for building (`scripts/build.ts`)
- **Oxlint and Oxfmt** for linting and formatting
- Obsidian's DOM helpers (`createEl`, `createDiv`, `setIcon`) and plain CSS in `src/global.css` for UI
- `src/shared/module-context.ts` for wiring modules together (dependency injection)
- `src/shared/reactive.ts` for `ref`, `computed` and `hook`
- `src/shared/key-value-store.ts` for IndexedDB and in-memory key-value storage

## Commands

- `bun run build`: build the plugin into `dist/`.
- `bun dev`: rebuild on change (unminified, inline source maps).
- `bun fix`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun tests`: run all tests (do not use `bun test`, it skips the Obsidian mock preload).
- `bun tests <test path>`: run tests in a specific file.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Layout

- `src/`: plugin core (sync, settings, UI). Entry point `src/index.ts`.
- `src/gdrive/`: Google Drive backend module.
- `src/smart-merge/`: three-way merge module.
- `src/shared/`: shared utilities: module context, reactive values, key-value store, paths.
- `src/sdk/`: the API surface modules use (`@/sdk`).
- `test/`: tests, mirroring `src/`. `test/mocks.ts` is preloaded and mocks `obsidian`.
- `docs/`: upstream documentation site. Not built, linted or formatted; kept until we decide what to do with it.

## Security

- No remote code: never add code that downloads, evaluates or imports JavaScript at runtime. Everything the plugin runs must be bundled from this repo.
- Network calls go only to Google (`googleapis.com`, `oauth2.googleapis.com`). Do not add other endpoints, telemetry or analytics.
- Do not add a dependency without asking first. Prefer platform APIs (Obsidian, Web APIs) or a small local implementation.
- Never commit credentials. Client ID and secret come from settings; the refresh token lives in secret storage.

## Conventions

- For mobile compatibility, Node.js API prohibited in plugin and modules.
- Sentence case for UI text.
- Module-specific behavior should not pollute plugin core.
- All Obsidian API mocks go in `test/obsidian-mock-api.ts`.
- Styling goes in `src/global.css` with `drive-bridge-` prefixed classes; never add unscoped selectors that could affect Obsidian or other plugins. Use `el.show()` / `el.hide()` for visibility.
- When any function or class needs to use `Context` as argument, prefer structural typing instead of direct `Context`.
- `gdrive` and `smart-merge` are modules bundled into `main.js` by `src/modules/BundledModules.ts`. To add a module, import it there; there is no runtime module loading.
- `null` forbidden, use `undefined` consistently.
- Lint warnings must be cleared, except time-bounded ones (TODO with date, deprecated API for compat)

## Documentation

- The primary documentation locates in `docs/src/pages/en/` has three sections in three folders: `usage/`, `development/`, and `deep-dive/`:
  - `usage/`: designed for non-technical users, avoid dev jargons
  - `development/`: SDK API reference and practical module development setups only
  - `deep-dive/`: plugin internals
- Prefer inter-page links when other pages have relevant content, duplication content cross-page is forbidden.
- Link format: Link to title anchors when possible, strict relative links, no `.md` extension.
- Only add inter-links when the content is truly relevant, you must not link distant pages just for link count.
- `usage/` and `deep-dive/` can interlink, `development/` can link to `usage/` and `deep-dive/`, but `usage/` and `deep-dive/` should avoid linking into `development/`.
- Don't be overly verbose.
- Official module specs should be self-contained in each page in `deep-dive/modules/`. They can link external pages but external pages should not link official modules, except in dedicated pages in `usage/`.
- Avoid large blocks of code in `usage/` and `deep-dive/`, code should be the major content in `development/`
- Documentation titles use title case.
