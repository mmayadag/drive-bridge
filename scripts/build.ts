// Builds the plugin into dist/: main.js, styles.css and manifest.json.
// `bun scripts/build.ts --watch` rebuilds on change without minifying.

import type { BuildOptions } from 'esbuild';
import { $ } from 'bun';
import { build, context } from 'esbuild';
import man from '../manifest.json';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const options: BuildOptions = {
	bundle: true,
	define: {
		'Bun.env.VERSION': JSON.stringify(man.version),
		// No client credentials are compiled into the release.
		'process.env.CLIENT_ID': JSON.stringify(''),
		'process.env.CLIENT_SECRET': JSON.stringify(''),
	},
	entryPoints: { main: 'src/index.ts', styles: 'src/global.css' },
	external: ['obsidian'],
	format: 'cjs',
	logLevel: 'info',
	mainFields: ['browser', 'module', 'main'],
	minify: !watch,
	outdir,
	platform: 'browser',
	sourcemap: watch ? 'inline' : false,
	target: 'es2022',
};

await $`rm -rf ${outdir}`;
await Bun.write(`${outdir}/manifest.json`, Bun.file('manifest.json'));

const watcher = watch ? await context(options) : undefined;
await (watcher ? watcher.watch() : build(options));
