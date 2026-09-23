import type { Settings } from '@';
import { expect, test } from 'bun:test';
import { defaultSettings, resetSettings } from '@/defaults';

test('reset puts settings back but keeps the backend, modules and last sync', () => {
	const modules = { gdrive: { baseDirectory: 'vault/', clientId: 'id' } };
	const lastSync = { at: 1, result: 'completed' as const };
	const settings = {
		...defaultSettings('.obsidian'),
		conflictResolver: 'keepLocal',
		decider: 'mirrorLocal',
		exclusionRules: [] as Settings['exclusionRules'],
		lastSync,
		modules,
		remoteFs: 'other',
		webhookOnStart: 'https://example.com/hook',
	};
	settings.scheduledSync.enabled = false;

	resetSettings(settings, '.obsidian');

	expect(settings.decider).toBe('bidirectional');
	expect(settings.conflictResolver).toBe('renameAndKeepBoth');
	expect(settings.webhookOnStart).toBe('');
	expect(settings.scheduledSync.enabled).toBe(true);
	expect(settings.exclusionRules).toStrictEqual(defaultSettings('.obsidian').exclusionRules);
	expect(settings.remoteFs).toBe('other');
	expect(settings.modules).toBe(modules);
	expect(settings.lastSync).toBe(lastSync);
});

test('reset does not share objects with the defaults', () => {
	const settings = defaultSettings('.obsidian');
	resetSettings(settings, '.obsidian');
	settings.realtimeSync.enabled = true;
	expect(defaultSettings('.obsidian').realtimeSync.enabled).toBe(false);
});
