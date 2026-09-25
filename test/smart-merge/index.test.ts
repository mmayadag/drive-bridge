// The Smart merge module: what start registers (the base-text wrapper, the resolver and the
// marker settings), Reset to defaults for the markers, and dispose removing it all.

import { expect, test } from 'bun:test';
import type { ConflictResolverEntry, FsWrapperEntry } from '@/modules/registrar';
import type { SettingEntry, SettingTree } from '@/modules/setting';
import { CONFLICTS } from '@/settings/layout';
import { openMemoryDB } from '@/shared/key-value-store';
import SmartMerge from '@/smart-merge';

function setup(conflictResolver = 'smartMerge') {
	const translations: Array<unknown> = [];
	const wrappers: Array<FsWrapperEntry> = [];
	const resolvers = new Map<string, ConflictResolverEntry>();
	const settingEntries: Array<SettingEntry> = [];
	const removed: Array<string> = [];
	const namespaces: Array<unknown> = [];
	let saves = 0;
	const indexedDB = openMemoryDB('smart-merge-index-test');
	const ctx = {
		getNamespace: (localFs?: unknown, remoteFs?: unknown) => {
			namespaces.push([localFs, remoteFs]);
			return 'ns';
		},
		indexedDB,
		registerConflictResolver: (id: string, entry: ConflictResolverEntry) => {
			resolvers.set(id, entry);
			return () => void removed.push('resolver');
		},
		registerRemoteFsWrapper: (entry: FsWrapperEntry) => {
			wrappers.push(entry);
			return () => void removed.push('wrapper');
		},
		registerSetting: (entry: SettingEntry) => {
			settingEntries.push(entry);
			return () => void removed.push('setting');
		},
		registerTranslations: (resource: unknown) => void translations.push(resource),
		saveSettings: () => Promise.resolve(void saves++),
		translate: (key: string) => key,
	};
	const module = new SmartMerge(ctx as never);
	const settings = { conflictResolver };
	Object.assign(module, { settings });
	return {
		indexedDB,
		module,
		namespaces,
		removed,
		resolvers,
		saves: () => saves,
		settingEntries,
		settings,
		translations,
		wrappers,
	};
}

function fakeFs() {
	return {
		delete: async () => {},
		move: async () => {},
		write: () => Promise.resolve('uid'),
	};
}

test('the constructor registers the translations and starts with the default markers', () => {
	const { module, translations } = setup();
	expect(translations).toHaveLength(1);
	expect(module.moduleSettings.conflictAStart).toBe('<mark class="conflict ours">');
	expect(module.moduleSettings.deletionEnd).toBe('</mark>');
});

test('resetSettings puts back the default markers', () => {
	const { module } = setup();
	const defaults = { ...module.moduleSettings };
	Object.assign(module.moduleSettings, { conflictAStart: '<<<', deletionEnd: '###' });
	module.resetSettings();
	expect(module.moduleSettings).toStrictEqual(defaults);
});

test('start registers the resolver with its texts and order', () => {
	const { module, resolvers } = setup();
	module.start();
	const entry = resolvers.get('smartMerge');
	expect(entry?.order).toBe(20);
	expect(entry?.prettyName()).toBe('smartMerge');
	expect(entry?.description?.()).toBe('smartMergeDescription');
	expect(typeof entry?.resolver).toBe('function');
	module.dispose();
});

test('the base-text wrapper only applies while Smart merge is selected', async () => {
	const { module, wrappers, settings, indexedDB, namespaces } = setup('renameAndKeepBoth');
	module.start();
	const [wrapper] = wrappers;
	expect(wrapper.priority).toBe(20_098);
	expect(wrapper.apply(fakeFs() as never)).toBeUndefined();

	settings.conflictResolver = 'smartMerge';
	const fs = fakeFs();
	const wrapped = wrapper.apply(fs as never);
	expect(wrapped).toBe(fs as never);
	expect(namespaces).toEqual([[undefined, fs]]);
	await wrapped?.write('note.md', new TextEncoder().encode('base'), {} as never);
	expect(indexedDB.getStore('base-text-ns').get('note.md')).toBe('base');
	module.dispose();
});

test('the marker settings sit under Conflicts and follow the selected strategy', () => {
	const { module, settingEntries, settings } = setup('keepLocal');
	module.start();
	const [entry] = settingEntries;
	expect(entry.priority).toBe(4048);
	const tree = entry.apply as unknown as Record<number, Record<number, SettingTree>>;
	const node = tree[CONFLICTS][1000];
	const definition = node(node) as unknown as { visible: () => boolean };
	expect(definition.visible()).toBe(false);
	settings.conflictResolver = 'smartMerge';
	expect(definition.visible()).toBe(true);
	module.dispose();
});

test('dispose removes everything start registered, once', () => {
	const { module, removed } = setup();
	module.start();
	module.dispose();
	expect(removed.toSorted()).toEqual(['resolver', 'setting', 'wrapper']);
	module.dispose();
	expect(removed).toHaveLength(3);
});
