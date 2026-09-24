# Drive Bridge

This is the repository for Drive Bridge, an Obsidian plugin that syncs vault files with Google Drive. All source code is in `src/`, tests in `test/`. User-facing overview is in `README.md`, technical notes in `TECHNICAL.md`.

## Context

- Read `TECHNICAL.md` first: it covers setup, the security model and sync behavior.
- This repo can double as an Obsidian test vault: `.obsidian/` (gitignored) with `dist/` symlinked to `.obsidian/plugins/drive-bridge`, whose `data.json` holds the plugin settings.
- `./test-files` are and are the only files used for local sync testing. You can do anything inside the folder without caring about changes or losses.

## Techstack

- **TypeScript 7** (native compiler) as programming language
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
- `bun check`: check types, lint and format (no file change). Lint warnings fail it.
- `bun tests`: run all tests (do not use `bun test`, it skips the Obsidian mock preload).
- `bun tests <test path>`: run tests in a specific file.
- `bun coverage`: run all tests with coverage; prints the totals and least covered files and fails below the floor in `scripts/coverage-summary.ts`.
- `bun ver <x.y.z>`: prepare a release (see Releasing in `TECHNICAL.md`); `bun ver --check [tag]` checks the release files agree.
- `bun changelog <milestone>`: print a CHANGELOG draft from the milestone's closed issues (GitHub CLI).
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Layout

- `src/`: plugin core (sync, settings, UI). Entry point `src/index.ts`.
- `src/gdrive/`: Google Drive backend module.
- `src/smart-merge/`: three-way merge module.
- `src/shared/`: shared utilities: module context, reactive values, key-value store, paths.
- `test/`: tests at the same path as the file they cover (`src/fs/vault/` → `test/fs/vault.test.ts`). Helpers live in `test/support/`; `setup.ts` is preloaded and mocks `obsidian`.

## Security

- No remote code: never add code that downloads, evaluates or imports JavaScript at runtime. Everything the plugin runs must be bundled from this repo.
- Network calls go only to Google (`googleapis.com`, `oauth2.googleapis.com`). Do not add other endpoints, telemetry or analytics.
- Do not add a dependency without asking first. Prefer platform APIs (Obsidian, Web APIs) or a small local implementation.
- No telemetry, analytics or crash reporting, in any form. The plugin must never report anything about a user, a vault or its use to anyone.
- Never commit credentials. Client ID and secret come from settings; the refresh token lives in secret storage.

## Conventions

- For mobile compatibility, Node.js API prohibited in plugin and modules.
- Sentence case for UI text.
- File and folder names are kebab-case (`progress-modal.ts`), including files that export a class. A test sits at the path of the file it covers, ending in `.test.ts`.
- Module-specific behavior should not pollute plugin core.
- All Obsidian API mocks go in `test/support/obsidian-api.ts`.
- Styling goes in `src/global.css` with `drive-bridge-` prefixed classes; never add unscoped selectors that could affect Obsidian or other plugins. Use `el.show()` / `el.hide()` for visibility.
- When any function or class needs to use `Context` as argument, prefer structural typing instead of direct `Context`.
- `gdrive` and `smart-merge` are modules bundled into `main.js` by `src/modules/bundled-modules.ts`. To add a module, import it there; there is no runtime module loading.
- `null` forbidden, use `undefined` consistently.
- Lint warnings must be cleared, except time-bounded ones (TODO with date, deprecated API for compat)
