// The plugin entry point: onload merges saved data over the defaults, wires every module
// into one context and starts them; onunload disposes them in reverse order.

// Installs a working IndexedDB on globalThis for this test file.
// oxlint-disable-next-line import/no-unassigned-import
import 'fake-indexeddb/auto';
import { createPlugin, flush } from '$/support/plugin-harness';
import { expect, test } from 'bun:test';

test('onload merges saved data over the defaults and saves it back', async () => {
	const harness = await createPlugin({ data: { decider: 'mirrorLocal' } });
	await harness.plugin.onload();
	await flush();
	const { settings } = harness.plugin;
	expect(settings.decider).toBe('mirrorLocal');
	expect(settings.conflictResolver).toBe('renameAndKeepBoth');
	expect(settings.exclusionRules.map((rule) => rule.expr)).toContain('.obsidian');
	expect(harness.saved.length).toBeGreaterThan(0);
	expect(harness.saved.at(-1)).toMatchObject({ decider: 'mirrorLocal' });
	harness.plugin.onunload();
});

test('onload starts every module: commands, ribbon, status bar and setting tab', async () => {
	const harness = await createPlugin();
	await harness.plugin.onload();
	const ids = harness.commands.map((command) => command.id);
	for (const id of ['start-sync', 'stop-sync', 'export-logs']) expect(ids).toContain(id);
	expect(harness.ribbonIcons.map((icon) => icon.icon)).toEqual(['refresh-cw', 'square']);
	expect(harness.statusBarItems.length).toBeGreaterThan(0);
	expect(harness.settingTabs).toHaveLength(1);
	expect(harness.plugin.context).toBeDefined();
	// The scheduler follows vault changes and the file menu adds its entries.
	expect(harness.registeredEvents.length).toBeGreaterThan(0);
	harness.plugin.onunload();
});

test('bundled modules are loaded and their settings stored under modules', async () => {
	const harness = await createPlugin({
		data: { modules: { gdrive: { clientId: 'saved-client' } } },
		vaultName: 'Notes',
	});
	await harness.plugin.onload();
	const { modules } = harness.plugin.settings;
	expect(Object.keys(modules)).toEqual(['gdrive', 'smart-merge']);
	expect(modules.gdrive).toMatchObject({ baseDirectory: 'Notes/', clientId: 'saved-client' });
	expect(harness.plugin.allModules.size).toBeGreaterThan(12);
	harness.plugin.onunload();
});

test('onunload disposes the modules and drops the context once', async () => {
	const harness = await createPlugin();
	await harness.plugin.onload();
	harness.plugin.onunload();
	expect(harness.plugin.context).toBeUndefined();
	// A second unload has nothing left to dispose.
	expect(() => harness.plugin.onunload()).not.toThrow();
});

test('saveSettings writes the current settings through saveData', async () => {
	const harness = await createPlugin();
	await harness.plugin.onload();
	harness.plugin.settings.decider = 'mirrorRemote';
	await harness.plugin.saveSettings();
	expect(harness.saved.at(-1)).toMatchObject({ decider: 'mirrorRemote' });
	harness.plugin.onunload();
});
