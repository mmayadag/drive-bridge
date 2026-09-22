# Drive Bridge

This is the monorepo for Drive Bridge, an Obsidian plugin that syncs vault files with Google Drive. The plugin itself and its modules are in `packages/`. User-facing overview is in `README.md`, technical notes in `TECHNICAL.md`.

## Context

- When exploring the repo, you must read related pages in `docs/src/pages/en/`, especially inside the `deep-dive/` folder: this is the fastest way to understand the engineering sophistication.
- This repo is also an Obsidian vault used for testing. The config folder is at `.obsidian`, and plugin dist folder is symlinked to `.obsidian/plugins/drive-bridge`. The folder also contains plugin settings in `data.json` and module binaries.
- `./test-files` are and are the only files used for local sync testing. You can do anything inside the folder without caring about changes or losses.

## Techstack

- **TypeScript 6** as programming language
- **Bun** as its package manager and task runner
- **Turbo** for monorepo orchestration
- **Tsdown** for building
- **Oxlint and Oxfmt** for linting and formatting
- **Solid.js** and **TailwindCSS** (via UnoCSS) for UI
- `packages/shared/src/kernel.ts` for dependency injection and reactive refs
- `packages/shared/src/kv.ts` for IndexedDB and in-memory key-value storage

## Commands

- `bun dev:plugin`: build plugin without cleaning dist
- `bun fix`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun dev`: building without clearing dist.
- `bun tests`: run all tests (do not use `bun test`).
- `bun tests -F <package-name> -- <test path>`: run tests in specific file.
- `bun <command> -F <package-name>`: run command targeting a specific package.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Packages

- Plugin & module SDK: `packages/plugin/`, package name `@drive-bridge/sdk`, `dev` builds SDK.
- Google Drive module: `packages/gdrive/`, package name `gdrive`.
- Shared utils: `packages/shared/`, package name `@repo/shared`.
- Upstream documentation site: `docs/`. Not a workspace and not built; kept until we decide what to do with it.
- Smart merge module: `packages/smart-merge/`, package name `smart-merge`.

## Security

- No remote code: never add code that downloads, evaluates or imports JavaScript at runtime. Everything the plugin runs must be bundled from this repo.
- Network calls go only to Google (`googleapis.com`, `oauth2.googleapis.com`). Do not add other endpoints, telemetry or analytics.
- Do not add a dependency without asking first. Prefer platform APIs (Obsidian, Web APIs) or a small local implementation.
- Never commit credentials. Client ID and secret come from settings; the refresh token lives in secret storage.

## Conventions

- For mobile compatibility, Node.js API prohibited in plugin and modules.
- Sentence case for UI text.
- Module-specific behavior should not pollute plugin core.
- All Obsidian API mocks go `packages/shared/test/obsidian-mock.ts`.
- Use inline Tailwind CSS for common styling, only use semantic CSS for animations and complex compositions. (Documentation website doesn't use TailwindCSS, you need to edit `docs/.vitepress/theme/styles.css`)
- When any function or class needs to use `Context` as argument, prefer structural typing instead of direct `Context`.
- `gdrive` and `smart-merge` are modules bundled into `main.js` by `packages/plugin/src/modules/BundledModules.ts`. To add a module, import it there; there is no runtime module loading.
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
