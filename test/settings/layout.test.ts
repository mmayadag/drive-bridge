import type { SettingDefinitionItem } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

class FakeTab {
	containerEl = { addClass: () => {} };
}

void mock.module('obsidian', () => ({ ...ObsidianMock, PluginSettingTab: FakeTab }));

const { default: Setting } = await import('@/modules/setting');
const { ref } = await import('@/shared/reactive');

const settings = {
	conflictResolver: 'renameAndKeepBoth',
	customHeaders: [],
	decider: 'bidirectional',
	exclusionRules: [{ caseSensitive: false, expr: '.trash' }],
	inclusionRules: [],
	maxFileSize: { enabled: false, value: 1 },
	maxMemoryConsumption: { enabled: true, value: 1 },
	maxRequestConcurrency: { enabled: true, value: 1 },
	minRequestInterval: { enabled: false, value: 0 },
	realtimeSync: { enabled: false, value: 5000 },
	realtimeSyncFastMode: true,
	remoteFs: 'gdrive',
	scheduledSync: { enabled: true, value: 1 },
	skipState: { failures: {}, skipped: [] as Array<string> },
	startupSync: { enabled: true, value: 1 },
	syncOnLeave: true,
};

function buildTab() {
	let tab: { getSettingDefinitions: () => Array<SettingDefinitionItem> } | undefined;
	const setting: InstanceType<typeof Setting> = new Setting({
		app: { workspace: { on: () => ({}) } },
		conflictResolverRegistry: new Map<string, unknown>([
			['renameAndKeepBoth', { order: 10, prettyName: () => 'rename' }],
			['keepLocal', { lossy: true, order: 50, prettyName: () => 'keepLocal' }],
			['skip', { order: 30, prettyName: () => 'skip' }],
		]),
		deciderRegistry: new Map<string, unknown>([
			[
				'mirrorLocal',
				{
					order: 20,
					prettyName: () => 'mirrorLocal',
					repair: true,
					warning: () => 'deletes',
				},
			],
			['bidirectional', { order: 10, prettyName: () => 'bidirectional' }],
		]),
		isIdle: ref(true),
		memoryDB: { getMeta: () => {}, getStore: () => new Map() },
		on: () => () => {},
		registerEvent: () => {},
		registerSetting: (entry: never) => setting.root.registerSetting(entry),
		remoteFsRegistry: new Map([['gdrive', { prettyName: () => 'Google Drive' }]]),
		settings,
		translate: (key: string) => key,
	} as never);
	Object.assign(setting['ctx' as never], setting.root);
	setting.start();
	setting.root.addSettingTab({ addSettingTab: (created: never) => (tab = created) } as never);
	return tab?.getSettingDefinitions() ?? [];
}

type Named = { name?: string; heading?: string; type?: string; items?: Array<Named> };
const names = (items: Array<Named> | undefined) =>
	(items ?? []).map((item) => item.name ?? item.heading ?? item.type);

test('the main screen keeps daily settings and links to the sub-pages', () => {
	const top = buildTab() as Array<Named>;
	expect(names(top)).toStrictEqual([
		'lastSync',
		'backend',
		'syncStrategy',
		'conflictResolveStrategy',
		'neverDeleteRemote',
		'group',
		'group',
		'group',
	]);
	const [more, help, coffee] = top.slice(-3);
	expect(names(more.items)).toStrictEqual(['automaticSync', 'filterRules', 'advanced']);
	expect(names(help.items)).toStrictEqual(['helpAndSupport']);
	expect(names(coffee.items)).toStrictEqual(['buyMeACoffee']);
});

test('each sub-page holds its settings', () => {
	const pages = (buildTab().at(-3) as Named).items ?? [];
	const [automatic, filters, advanced] = pages;
	expect(names(automatic.items)).toStrictEqual([
		'realtimeSync',
		'startupSync',
		'scheduledSync',
		'syncOnLeave',
		'realtimeSyncFastMode',
	]);
	expect(names(filters.items)).toStrictEqual(['inclusionRules', 'exclusionRules']);
	expect(names(advanced.items)).toStrictEqual([
		'controls',
		'miscellaneous',
		'webhooks',
		'development',
		'group',
		'group',
	]);
});

type Page = Named & { displayValue: () => string; status: () => string | null };

test('the strategy pages group safe and risky choices and warn on the risky ones', () => {
	const top = buildTab() as Array<Page>;
	const strategy = top.find((item) => item.name === 'syncStrategy');
	const conflicts = top.find((item) => item.name === 'conflictResolveStrategy');
	expect(strategy?.type).toBe('page');
	expect(strategy?.items?.map((group) => [group.heading, names(group.items)])).toStrictEqual([
		[undefined, ['bidirectional']],
		['forRepairs', ['mirrorLocal']],
	]);
	expect(conflicts?.items?.map((group) => [group.heading, names(group.items)])).toStrictEqual([
		['nothingLost', ['rename', 'skip']],
		['replacesOneVersion', ['keepLocal']],
	]);
	expect(strategy?.displayValue()).toBe('bidirectional');
	expect(strategy?.status()).toBeFalsy();

	settings.decider = 'mirrorLocal';
	settings.conflictResolver = 'keepLocal';
	expect(strategy?.status()).toBe('warning');
	expect(conflicts?.status()).toBe('warning');
	expect(conflicts?.displayValue()).toBe('keepLocal');
	settings.decider = 'bidirectional';
	settings.conflictResolver = 'renameAndKeepBoth';
});

test('a risky strategy replaces the entry description with its warning', () => {
	const entry = () =>
		(buildTab() as Array<Page & { desc?: unknown }>).find(
			(item) => item.name === 'syncStrategy',
		);
	expect(entry()?.desc).toBe('syncStrategyDescription');
	settings.decider = 'mirrorLocal';
	expect(entry()?.desc).not.toBe('syncStrategyDescription');
	expect((entry()?.desc as { textContent?: string })?.textContent).toContain('deletes');
	settings.decider = 'bidirectional';
});
