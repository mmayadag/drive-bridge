// The settings tree merges same-key registrations from different modules; when the earlier
// (lower-priority) one built a plain nested object at a key and a later one supplies a
// callable node for that same key, the merge has to happen "in reverse" — rooting the
// result at the later, callable node while keeping the earlier one's children.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

class FakeTab {
	containerEl = { addClass: () => {} };
}

void mock.module('obsidian', () => ({ ...ObsidianMock, PluginSettingTab: FakeTab }));

const { default: Setting } = await import('@/modules/setting');

function buildTab(register: (registerSetting: (entry: never) => void) => void) {
	let tab: { getSettingDefinitions: () => Array<Record<string, unknown>> } | undefined;
	const setting = new Setting({
		on: () => () => {},
		registerSetting: (entry: never) => {
			registered.push(entry);
			return () => true;
		},
		translate: (key: string) => key,
	} as never);
	const registered: Array<never> = [];
	register((entry) => setting.root.registerSetting(entry));
	setting.root.addSettingTab({ addSettingTab: (created: never) => (tab = created) } as never);
	return tab?.getSettingDefinitions() ?? [];
}

test('a later callable registration at a key already built from a plain object reverses cleanly', () => {
	const items = buildTab((registerSetting) => {
		// Lower priority: a plain object at key 77, whose own child (key 50) is callable.
		registerSetting({
			apply: { 77: { 50: () => ({ name: 'inner-first' }) } },
			priority: 10,
		} as never);
		// Higher priority: a callable node at that same key 77.
		registerSetting({
			apply: {
				77: (self: Record<number, () => unknown>) => ({
					items: Object.values(self).map((node) => node()),
					name: 'outer-second',
					type: 'group',
				}),
			},
			priority: 20,
		} as never);
	});

	expect(items).toHaveLength(1);
	const merged = items[0] as { items: Array<{ name: string }>; name: string; type: string };
	expect(merged.name).toBe('outer-second');
	expect(merged.type).toBe('group');
	// The earlier module's child at key 50 survived the reversal.
	expect(merged.items.map((item) => item.name)).toContain('inner-first');
});

test('the small delegate methods run without a settings tab open yet', () => {
	const setting = new Setting({
		on: () => () => {},
		registerSetting: () => () => true,
		translate: (key: string) => key,
	} as never);

	expect(setting.root.matchLabel()).toMatchObject({
		text: 'match',
		tooltip: 'matchLabelDescription',
	});
	expect(setting.root.speedLabel()).toMatchObject({
		text: 'speed',
		tooltip: 'speedLabelDescription',
	});
	// No tab has been added yet, so these are no-ops rather than throwing.
	expect(() => setting.root.rerenderSettingTab()).not.toThrow();
	expect(() => setting.root.refreshSettingTab()).not.toThrow();
	expect(() => setting.root.openImportSettings()).not.toThrow();
	expect(() => setting.root.openExportSettings()).not.toThrow();
	expect(() => setting.dispose()).not.toThrow();
});

test('a plain object at the top level renders as a placeholder until a module fills it', () => {
	const items = buildTab((registerSetting) => {
		registerSetting({
			apply: { 88: { 50: () => ({ name: 'child' }) } },
			priority: 10,
		} as never);
	});
	expect(items).toStrictEqual([{ name: 'dummy' }]);
});

test('with a tab open, rerender and refresh reach it', () => {
	const calls: Array<string> = [];
	let rerenderOnLoad: (() => void) | undefined;
	const setting = new Setting({
		on: (_event: string, fn: () => void) => {
			rerenderOnLoad = fn;
			return () => {};
		},
		registerSetting: () => () => true,
		translate: (key: string) => key,
	} as never);
	setting.root.addSettingTab({
		addSettingTab: (tab: { update: () => void; refreshDomState: () => void }) => {
			tab.update = () => void calls.push('update');
			tab.refreshDomState = () => void calls.push('refresh');
		},
	} as never);

	setting.root.rerenderSettingTab();
	setting.root.refreshSettingTab();
	rerenderOnLoad?.();
	expect(calls).toStrictEqual(['update', 'refresh', 'update']);
});
