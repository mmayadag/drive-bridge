// Loads the built dist/main.js the way Obsidian does and runs onload, as a phone and as a
// desktop. Three releases once failed to load while every unit test passed (#115).

import { stubElement } from '$/support/obsidian-api';
import ObsidianMock from '$/support/obsidian-mock';
import { afterAll, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const BUNDLE = '../dist/main.js';
const built = await Bun.file(new URL(BUNDLE, import.meta.url)).exists();

// DOM globals Obsidian provides; only added where the test process has none.
const globals: Record<string, unknown> = {
	activeDocument: stubElement(),
	activeWindow: globalThis,
	createDiv: stubElement,
	createEl: stubElement,
	createSpan: stubElement,
	createSvg: stubElement,
	document: stubElement(),
};
const added = Object.keys(globals).filter((key) => !(key in globalThis));
for (const key of added) (globalThis as Record<string, unknown>)[key] = globals[key];
afterAll(() => {
	for (const key of added) delete (globalThis as Record<string, unknown>)[key];
});

function fakeApp() {
	const secrets = new Map<string, string>();
	const noop = () => {};
	return {
		metadataCache: { on: () => ({}) },
		secretStorage: {
			deleteSecret: (key: string) => void secrets.delete(key),
			// oxlint-disable-next-line unicorn/no-null -- Obsidian returns null for a missing secret
			getSecret: (key: string) => secrets.get(key) ?? null,
			setSecret: (key: string, value: string) => void secrets.set(key, value),
		},
		vault: {
			adapter: stubElement(),
			configDir: '.obsidian',
			getName: () => 'vault',
			on: () => ({}),
		},
		workspace: {
			getActiveFile: () => {},
			getMostRecentLeaf: () => {},
			on: () => ({}),
			onLayoutReady: noop,
		},
	};
}

type PluginInstance = { onload: () => Promise<void>; onunload?: () => void };
type Bundle = { default: { default: new (app: unknown) => PluginInstance } };

for (const mobile of [true, false])
	test.skipIf(!built)(
		`the built plugin loads ${mobile ? 'on a phone' : 'on desktop'}`,
		async () => {
			const platform = { ...ObsidianMock.Platform };
			Object.assign(ObsidianMock.Platform, { isDesktop: !mobile, isMobile: mobile });
			try {
				const bundle = (await import(BUNDLE)) as Bundle;
				const plugin = new bundle.default.default(fakeApp());
				let failure: unknown;
				await plugin.onload().catch((error: unknown) => (failure = error));
				expect(failure).toBeUndefined();
				plugin.onunload?.();
			} finally {
				// Other files read the same Platform.
				Object.assign(ObsidianMock.Platform, platform);
			}
		},
	);
