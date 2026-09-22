import UnoCSS from '@unocss/postcss';
import postcssMergeRules from 'postcss-merge-rules';
import { defineConfig } from 'tsdown';
import solid from 'unplugin-solid/rolldown';
import man from './manifest.json' with { type: 'json' };

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	copy: [{ from: 'manifest.json', to: 'dist' }],
	css: {
		fileName: 'styles.css',
		minify: true,
		postcss: { plugins: [UnoCSS(), postcssMergeRules()] },
		transformer: 'postcss',
	},
	define: {
		'Bun.env.VERSION': JSON.stringify(man.version),
		// No client credentials are compiled into the release.
		'process.env.CLIENT_ID': JSON.stringify(''),
		'process.env.CLIENT_SECRET': JSON.stringify(''),
	},
	deps: { neverBundle: ['obsidian'], onlyBundle: false },
	dts: false,
	entry: { main: 'src/index.ts' },
	format: 'cjs',
	inputOptions: {
		resolve: {
			aliasFields: [['browser']],
			conditionNames: ['browser'],
			mainFields: ['browser', 'module', 'main'],
		},
	},
	minify: true,
	outDir: 'dist',
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	platform: 'browser',
	// Fixes SolidJS cannot attach eventListeners to elements existing on another window
	plugins: [solid({ solid: { delegateEvents: false } })],
	target: 'es2024',
});
