// oxlint-disable no-console, import/no-nodejs-modules -- a maintainer script, not plugin code
// `bun visual [--out <dir>]` renders a few settings rows with the built dist/styles.css at
// phone width, in the dark and the light theme, into one contact sheet. It approximates
// Obsidian's layout (no Obsidian CSS) to catch layout regressions in CSS changes: run it
// before and after a change with different --out folders and compare.
//
// Needs a Chromium: CHROMIUM=/path/to/chrome, or one installed by Playwright.

import { $ } from 'bun';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WIDTH = 390;

// Stand-ins for the Obsidian variables and base layout the plugin's CSS relies on.
const BASE = `
body { margin: 0; padding: 16px; font: 15px/1.4 -apple-system, "Segoe UI", sans-serif;
  --size-4-1: 4px; --size-4-2: 8px; --size-4-3: 12px; --size-4-4: 16px; --radius-s: 6px;
  --font-ui-smaller: 12px; --font-monospace: ui-monospace, monospace; --font-interface: sans-serif;
  --interactive-accent: #8b73ee; --text-on-accent: #fff; --text-warning: #e0a030; }
body.theme-dark { background: #000; color: #dadada; --card: #1e1e1e; --muted: #999;
  --text-faint: #666; --background-secondary: #2a2a2a; --background-modifier-border-hover: #666; }
body.theme-light { background: #f2f2f7; color: #222; --card: #fff; --muted: #777;
  --text-faint: #999; --background-secondary: #eee; --background-modifier-border-hover: #aaa; }
.drive-bridge-setting { container-type: inline-size; }
.card { background: var(--card); border-radius: 22px; padding: 2px 16px; margin-bottom: 14px; }
.label { font-size: 12px; color: var(--muted); margin: 0 6px 6px; }
.setting-item { display: flex; align-items: center; gap: 8px; padding: 14px 0; }
.setting-item + .setting-item { border-top: 1px solid #8883; }
.setting-item-info { flex: 1; }
.setting-item-description { color: var(--muted); font-size: 13.5px; margin-top: 3px; }
.setting-item-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
input { height: 40px; width: 150px; border: 0; border-radius: 20px; padding: 0 14px;
  background: var(--background-secondary); color: inherit; font-size: 15px; }
button { height: 40px; border: 0; border-radius: 20px; padding: 0 16px; font-size: 15px; }
.is-mobile .setting-item-control button { flex: 1 1 auto; }
.mod-cta { background: var(--interactive-accent); color: #fff; }
`;

const row = (name: string, desc: string, control: string, cls = '') =>
	`<div class="setting-item ${cls}"><div class="setting-item-info"><div class="setting-item-name">${name}</div><div class="setting-item-description">${desc}</div></div><div class="setting-item-control">${control}</div></div>`;

const flow = (d: string) =>
	`<svg aria-hidden="true" viewBox="0 0 124 28" class="drive-bridge-flow"><rect height="20" rx="5" width="36" x="2" y="4" class="drive-bridge-flow-vault"/><text x="20" y="17.5">Vault</text><rect height="20" rx="10" width="36" x="86" y="4" class="drive-bridge-flow-drive"/><text x="104" y="17.5" class="drive-bridge-flow-dark">Drive</text><path d="${d}" class="drive-bridge-flow-arrow"/></svg>`;

const choice = (checked: boolean, name: string, desc: string, extra: string) =>
	`<div class="setting-item drive-bridge-choice"><div class="drive-bridge-radio${checked ? ' is-checked' : ''}"></div><div class="setting-item-info"><div class="setting-item-name">${name}</div><div class="setting-item-description">${desc}${extra}</div></div><div class="setting-item-control"></div></div>`;

const CUP = `<svg aria-hidden="true" viewBox="0 0 40 54" class="drive-bridge-coffee-cup"><path class="drive-bridge-coffee-milk" d="M10.5 26.5c3-2 6-2 9.5 0s7 2 10-.5L28.2 47.5c-.2 1.6-1.4 2.5-3 2.5H14.8c-1.6 0-2.8-.9-3-2.5z"/><path class="drive-bridge-coffee-line" d="M8 17l3.5 31c.2 1.6 1.4 2.5 3 2.5h11c1.6 0 2.8-.9 3-2.5L32 17"/><path class="drive-bridge-coffee-line" d="M8 10.5h24a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z"/><path class="drive-bridge-coffee-line" d="M9 10.5c0-5 22-6.5 22-1"/><path class="drive-bridge-coffee-line" d="M13 8c3-2 12-2 14 0"/></svg>`;

/** Each fixture is one card of settings rows, as the plugin renders them. */
const FIXTURES: Record<string, string> = {
	'coffee footer': `<div class="setting-item drive-bridge-coffee"><div class="setting-item-info">Buy me a coffee</div><div class="setting-item-control"><div class="drive-bridge-coffee-question">It works! Coffee time?</div><a class="drive-bridge-coffee-button" href="#">${CUP}<span>Buy me a coffee</span></a><div class="drive-bridge-coffee-version">Drive Bridge 0.0.0</div></div></div>`,
	conflicts: choice(
		true,
		'Rename and keep both',
		'The newer edit keeps the name; the other is saved beside it.',
		'<div class="drive-bridge-choice-example">note.md edited on two devices → note.md + note.conflict.md</div>',
	),
	'connect account': row(
		'Connect account',
		'Run <code>rclone authorize</code> on a computer and paste the token.',
		'<input type="password" placeholder="Refresh token or rclone output"><button class="mod-cta">Connect</button>',
		'drive-bridge-stacked-setting',
	),
	'merge markers': row(
		'"Ours" conflict markers',
		'Markers around local changes in a merge conflict.',
		'<input type="text" value="&lt;mark class=&quot;conflict ours&quot;&gt;"><input type="text" value="&lt;/mark&gt;">',
		'drive-bridge-togglable-value drive-bridge-marker-setting',
	),
	'sync strategy': [
		choice(
			true,
			'Bidirectional',
			'Changes on either side are copied to the other.',
			flow('M46 14h32M72 8l6 6-6 6M52 8l-6 6 6 6'),
		),
		choice(
			false,
			'Mirror local',
			'Drive becomes a copy of this vault.',
			flow('M46 14h32M72 8l6 6-6 6'),
		),
	].join(''),
};

async function findChromium() {
	if (Bun.env.CHROMIUM) return Bun.env.CHROMIUM;
	const root = join(homedir(), '.cache/ms-playwright');
	const dirs = (await readdir(root).catch(() => [])).filter((dir) => dir.startsWith('chromium-'));
	for (const dir of dirs.toSorted().toReversed())
		for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome'])
			if (await Bun.file(join(root, dir, sub)).exists()) return join(root, dir, sub);
	throw new Error('No Chromium found. Set CHROMIUM=/path/to/chrome.');
}

function page(css: string, theme: 'dark' | 'light') {
	const cards = Object.entries(FIXTURES)
		.map(([name, html]) => `<div class="label">${name}</div><div class="card">${html}</div>`)
		.join('');
	return `<html><head><style>${BASE}\n${css}</style></head><body class="is-mobile theme-${theme}"><div class="drive-bridge-setting">${cards}</div></body></html>`;
}

const outIndex = Bun.argv.indexOf('--out');
const out = outIndex === -1 ? 'visual' : (Bun.argv[outIndex + 1] ?? 'visual');
await $`bun run build`.quiet();
const css = await Bun.file('dist/styles.css').text();
const chromium = await findChromium();
await mkdir(out, { recursive: true });
for (const theme of ['dark', 'light'] as const) {
	const html = join(out, `${theme}.html`);
	await Bun.write(html, page(css, theme));
	await $`${chromium} --headless --no-sandbox --hide-scrollbars --force-device-scale-factor=2 --window-size=${WIDTH},1100 --screenshot=${join(out, `${theme}.png`)} ${html}`.quiet();
}
await Bun.write(
	join(out, 'sheet.html'),
	`<html><body style="margin:0;display:flex;gap:8px;background:#444"><img src="dark.png" width="${WIDTH}"><img src="light.png" width="${WIDTH}"></body></html>`,
);
await $`${chromium} --headless --no-sandbox --hide-scrollbars --force-device-scale-factor=2 --window-size=${WIDTH * 2 + 8},1100 --screenshot=${join(out, 'sheet.png')} ${join(out, 'sheet.html')}`.quiet();
console.log(`Wrote ${join(out, 'sheet.png')} (dark and light, ${WIDTH}px wide).`);
