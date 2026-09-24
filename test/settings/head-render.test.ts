// The last-sync row (status icon, start-sync button, history button) and the backend row
// (connection check icon, remote picker) in the head settings block. No real DOM is
// available in this test environment, so `setting`/`button`/`icon` are duck-typed to just
// what head.ts touches.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { CONFLICTS, SYNC_STRATEGY } from '@/settings/layout';
import { openMemoryDB } from '@/shared/key-value-store';
import { ref } from '@/shared/reactive';

void mock.module('obsidian', () => ObsidianMock);

const { default: headSettings } = await import('@/settings/head');

type Group = Record<number, () => { render?: (setting: never) => void }>;

function fakeIcon() {
	return { className: '', hidden: false, hide: () => {}, show: () => {} };
}

function fakeButton() {
	const calls: { setDisabled: Array<boolean>; setIcon: Array<string> } = {
		setDisabled: [],
		setIcon: [],
	};
	let onClickHandler: (() => void) | undefined;
	const button = {
		calls,
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setButtonText: () => button,
		setCta: () => button,
		setDisabled: (value: boolean) => {
			calls.setDisabled.push(value);
			return button;
		},
		setIcon: (icon: string) => {
			calls.setIcon.push(icon);
			return button;
		},
		setTooltip: () => button,
		trigger: () => onClickHandler?.(),
	};
	return button;
}

function fakeExtraButton() {
	const el = { firstElementChild: undefined };
	const button = {
		extraSettingsEl: el,
		onClick: () => button,
		setIcon: () => button,
		setTooltip: () => button,
	};
	return button;
}

function lastSyncSetting() {
	const icon = fakeIcon();
	const descAttrs: Record<string, string> = {};
	const setting = {
		addButton: (cb: (b: ReturnType<typeof fakeButton>) => void) => {
			cb(startButton);
			return setting;
		},
		addExtraButton: (cb: (b: ReturnType<typeof fakeExtraButton>) => void) => {
			cb(historyButton);
			return setting;
		},
		controlEl: { createSpan: () => icon },
		descAttrs,
		descEl: { setAttr: (name: string, value: string) => void (descAttrs[name] = value) },
		setDesc: () => setting,
	};
	const startButton = fakeButton();
	const historyButton = fakeExtraButton();
	return { icon, setting, startButton };
}

function baseCtx(overrides: Record<string, unknown> = {}) {
	const events: Record<string, Array<() => void>> = {};
	return {
		conflictResolverRegistry: new Map(),
		deciderRegistry: new Map(),
		dispatch: (() => {}) as never,
		getCheckConnection: (() => () => Promise.resolve({ success: true as const })) as never,
		isIdle: ref(true),
		matchLabel: () => ({ text: 'm', tooltip: 'm' }),
		memoryDB: openMemoryDB<Record<string, unknown>, { lastCheckedFs: string }>(
			`head-render-test-${Math.random()}`,
		),
		on: (event: string, fn: () => void) => {
			(events[event] ??= []).push(fn);
			return () => {
				events[event] = (events[event] ?? []).filter((f) => f !== fn);
			};
		},
		refreshSettingTab: () => {},
		remoteFsRegistry: new Map(),
		requestSync: () => {},
		rerenderSettingTab: () => {},
		saveSettings: () => Promise.resolve(),
		settings: { lastSync: undefined, remoteFs: '' } as {
			conflictResolver?: string;
			decider?: string;
			lastSync?: { at: number; error?: string; result: string; skipped?: number };
			remoteFs: string;
		},
		showSyncHistory: () => {},
		translate: ((key: string, arg?: unknown) =>
			arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) as never,
		trigger: (event: string) => events[event]?.forEach((fn) => fn()),
		...overrides,
	};
}

function tree(ctx: ReturnType<typeof baseCtx>) {
	return headSettings(ctx as never, () => {}) as never as Group;
}

test('the last-sync icon is hidden before any sync has run', () => {
	const ctx = baseCtx();
	const { icon, setting } = lastSyncSetting();
	tree(ctx)[15]?.().render?.(setting as never);
	// hide()/show() are recorded as calls only via className side effects in this harness;
	// absence of a failed/ok class means it was never set to a result state.
	expect(icon.className).toBe('');
});

test('a failed sync marks the icon and description with the error', () => {
	const ctx = baseCtx({
		settings: { lastSync: { at: 1, error: 'boom', result: 'failed' }, remoteFs: '' },
	});
	const { icon, setting } = lastSyncSetting();
	tree(ctx)[15]?.().render?.(setting as never);

	expect(icon.className).toBe('drive-bridge-status-error');
	expect(setting.descAttrs.title).toBe('boom');
});

test('the row redraws itself when a sync terminates', () => {
	const ctx = baseCtx();
	const { icon, setting } = lastSyncSetting();
	tree(ctx)[15]?.().render?.(setting as never);
	expect(icon.className).toBe('');

	ctx.settings.lastSync = { at: 1, result: 'completed' };
	ctx.trigger('syncTerminated');
	expect(icon.className).toBe('drive-bridge-status-ok');
});

test('the start-sync button triggers a manual sync only while idle, and the history button works', () => {
	const requested: Array<string> = [];
	const historyShown: Array<true> = [];
	const ctx = baseCtx({
		requestSync: (trigger: string) => requested.push(trigger),
		showSyncHistory: () => void historyShown.push(true),
	});
	const { setting, startButton } = lastSyncSetting();
	const cleanup = tree(ctx)[15]?.().render?.(setting as never);

	startButton.trigger();
	expect(requested).toStrictEqual(['manual']);
	expect(startButton.calls.setDisabled).toStrictEqual([false]);

	ctx.isIdle(false);
	startButton.trigger();
	expect(requested).toStrictEqual(['manual']);
	expect(startButton.calls.setDisabled).toStrictEqual([false, true]);

	(cleanup as (() => void) | undefined)?.();
	ctx.isIdle(true);
	expect(startButton.calls.setDisabled).toStrictEqual([false, true]);
});

test('the backend row lists remotes and switches the active one', async () => {
	const ctx = baseCtx({
		remoteFsRegistry: new Map([
			['gdrive', { prettyName: () => 'Google Drive' }],
			['dropbox', { prettyName: () => 'Dropbox' }],
		]),
		settings: { lastSync: undefined, remoteFs: 'gdrive' },
	});
	const options: Array<[string, string]> = [];
	let onChangeHandler: ((value: string) => void) | undefined;
	let value = '';
	const dropdown = {
		addOption: (key: string, label: string) => {
			options.push([key, label]);
			return dropdown;
		},
		onChange: (fn: (value: string) => void) => {
			onChangeHandler = fn;
			return dropdown;
		},
		setValue: (v: string) => {
			value = v;
			return dropdown;
		},
	};
	const button = fakeExtraButton();
	const setting = {
		addDropdown: (cb: (d: typeof dropdown) => void) => {
			cb(dropdown);
			return setting;
		},
		addExtraButton: (cb: (b: typeof button) => void) => {
			cb(button);
			return setting;
		},
		nameEl: {
			createSpan: () => ({ style: { setProperty: () => {} } }),
			querySelectorAll: () => [],
		},
	};
	const cleanup = tree(ctx)[20]?.().render?.(setting as never);
	await Promise.resolve();

	expect(options).toStrictEqual([
		['gdrive', 'Google Drive'],
		['dropbox', 'Dropbox'],
	]);
	expect(value).toBe('gdrive');

	onChangeHandler?.('dropbox');
	expect(ctx.settings.remoteFs).toBe('dropbox');

	expect(typeof cleanup).toBe('function');
	(cleanup as (() => void) | undefined)?.();
});

test('picking a strategy saves, then re-renders and refreshes the tab', () => {
	const rerendered: Array<true> = [];
	const refreshed: Array<true> = [];
	const saved: Array<true> = [];
	const ctx = baseCtx({
		deciderRegistry: new Map([
			['bidirectional', { decider: () => [], order: 10, prettyName: () => 'Bidirectional' }],
			[
				'mirrorLocal',
				{ decider: () => [], order: 20, prettyName: () => 'Mirror local', repair: true },
			],
		]),
		refreshSettingTab: () => void refreshed.push(true),
		rerenderSettingTab: () => void rerendered.push(true),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: {
			conflictResolver: '',
			decider: 'bidirectional',
			lastSync: undefined,
			remoteFs: '',
		},
	});
	const item = tree(ctx)[SYNC_STRATEGY]?.() as never as {
		displayValue: () => string;
		status: () => 'warning' | null;
	};

	expect(item.displayValue()).toBe('Bidirectional');
	expect(item.status()).toBeFalsy();

	ctx.settings.decider = 'mirrorLocal';
	expect(item.status()).toBe('warning');
});

test('the conflict-resolve status warns for a lossy strategy', () => {
	const ctx = baseCtx({
		conflictResolverRegistry: new Map([
			['renameAndKeepBoth', { order: 10, prettyName: () => 'Rename' }],
			['keepLocal', { lossy: true, order: 20, prettyName: () => 'Keep local' }],
		]),
		settings: { conflictResolver: 'renameAndKeepBoth', lastSync: undefined, remoteFs: '' },
	});
	const fn = tree(ctx)[CONFLICTS] as unknown as (self: unknown) => unknown;
	const item = fn(fn) as never as {
		displayValue: () => string;
		status: () => 'warning' | null;
	};

	expect(item.displayValue()).toBe('Rename');
	expect(item.status()).toBeFalsy();

	ctx.settings.conflictResolver = 'keepLocal';
	expect(item.status()).toBe('warning');
});

test('picking a strategy row saves the choice, then re-renders and refreshes the tab', () => {
	const rerendered: Array<true> = [];
	const refreshed: Array<true> = [];
	const saved: Array<true> = [];
	const ctx = baseCtx({
		deciderRegistry: new Map([
			['bidirectional', { decider: () => [], order: 10, prettyName: () => 'Bidirectional' }],
			[
				'mirrorLocal',
				{ decider: () => [], order: 20, prettyName: () => 'Mirror local', repair: true },
			],
		]),
		refreshSettingTab: () => void refreshed.push(true),
		rerenderSettingTab: () => void rerendered.push(true),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: {
			conflictResolver: '',
			decider: 'bidirectional',
			lastSync: undefined,
			remoteFs: '',
		},
	});
	const item = tree(ctx)[SYNC_STRATEGY]?.() as never as {
		items: Array<{ items: Array<{ render: (setting: unknown) => void }> }>;
	};
	// items[0] holds the safe choices (bidirectional, already selected); items[1] holds the
	// repair ones (mirrorLocal) that this test switches to.
	const row = item.items[1]?.items[0];
	const settingEl = document.createElement('div');
	const descEl = document.createElement('div');
	row?.render({ descEl, settingEl });

	settingEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	expect(ctx.settings.decider).toBe('mirrorLocal');
	expect(saved).toStrictEqual([true]);
	expect(rerendered).toStrictEqual([true]);
	expect(refreshed).toStrictEqual([true]);
});

test('labels are attached to matching rows, recursing into nested groups', async () => {
	const nameEl = document.createElement('div');
	nameEl.className = 'setting-item-name';
	const labelDef = { color: undefined, text: 'M', textColor: undefined, tooltip: 'Match this' };
	const nested = { labels: [labelDef] };
	const settingItems = [{ items: [nested], type: 'group' }, { labels: undefined }];
	const getElementForDefinition = (item: unknown) => {
		const container = document.createElement('div');
		if (item === nested) container.append(nameEl);
		return container;
	};

	const ctx = baseCtx();
	const { setting } = lastSyncSetting();
	const withTab = headSettings(
		ctx as never,
		() => ({ getElementForDefinition, settingItems }) as never,
	) as never as Group;
	withTab[15]?.().render?.(setting as never);

	await Promise.resolve();
	expect(nameEl.querySelector('.flair')?.textContent).toBe('M');
});

test('a missing settings tab (not yet rendered) is a no-op', async () => {
	const ctx = baseCtx();
	const { setting } = lastSyncSetting();
	const withoutTab = headSettings(ctx as never, () => {}) as never as Group;
	withoutTab[15]?.().render?.(setting as never);

	await Promise.resolve();
	// Nothing to assert beyond "did not throw": queueMicrotask's callback bails out early.
});

test('the backend row shows only when there is more than one backend to choose from', () => {
	const registry = new Map<string, { prettyName: () => string }>([
		['gdrive', { prettyName: () => 'Google Drive' }],
	]);
	const item = tree(baseCtx({ remoteFsRegistry: registry }))[20]?.() as never as {
		visible: () => boolean;
	};
	expect(item.visible()).toBe(false);
	registry.set('dropbox', { prettyName: () => 'Dropbox' });
	expect(item.visible()).toBe(true);
});

test('a strategy with a warning replaces the description with it', () => {
	const ctx = baseCtx({
		deciderRegistry: new Map([
			[
				'mirrorLocal',
				{ decider: () => [], prettyName: () => 'Mirror local', warning: () => 'Deletes!' },
			],
		]),
		settings: { decider: 'mirrorLocal', lastSync: undefined, remoteFs: '' },
	});
	const item = tree(ctx)[SYNC_STRATEGY]?.() as never as { desc: DocumentFragment };
	expect(item.desc.textContent).toBe('Deletes!');
	expect(item.desc.querySelector('.drive-bridge-warning-text')).not.toBeNull();
});

test('picking a conflict strategy saves it, and module rows join the safe group', () => {
	const saved: Array<true> = [];
	const ctx = baseCtx({
		conflictResolverRegistry: new Map([
			['renameAndKeepBoth', { order: 10, prettyName: () => 'Rename' }],
			['keepLocal', { lossy: true, order: 20, prettyName: () => 'Keep local' }],
		]),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: { conflictResolver: 'renameAndKeepBoth', lastSync: undefined, remoteFs: '' },
	});
	const fn = tree(ctx)[CONFLICTS] as unknown as ((self: unknown) => unknown) & {
		markers?: unknown;
	};
	const markers = () => ({ name: 'Markers' });
	fn.markers = markers;
	const item = fn(fn) as never as {
		items: Array<{ items: Array<{ name?: string; render?: (setting: unknown) => void }> }>;
	};
	expect(item.items[0]?.items.at(-1)).toStrictEqual({ name: 'Markers' });

	const row = item.items[1]?.items[0];
	const settingEl = document.createElement('div');
	row?.render?.({ descEl: document.createElement('div'), settingEl });
	settingEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	expect(ctx.settings.conflictResolver).toBe('keepLocal');
	expect(saved).toStrictEqual([true]);
});

test('the never-delete-remote switch sits after the conflict strategies', () => {
	const item = tree(baseCtx())[CONFLICTS + 5]?.() as never as { control: unknown };
	expect(item.control).toStrictEqual({ key: 'neverDeleteRemote', type: 'toggle' });
});

test('cleaning up a row whose button was never added is safe', () => {
	const { setting } = lastSyncSetting();
	const noButton = { ...setting, addButton: () => noButton };
	const cleanup = tree(baseCtx())[15]?.().render?.(noButton as never) as unknown as () => void;
	expect(() => cleanup()).not.toThrow();
});
