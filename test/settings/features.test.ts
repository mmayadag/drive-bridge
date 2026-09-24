// Automatic-sync feature rows: the plain pause toggle, and the scheduled-sync field, which
// restarts the schedule on a value change and starts/stops it on enable/disable.

import { expect, test } from 'bun:test';
import featuresSettings from '@/settings/features';
import { MORE, PAGE } from '@/settings/layout';

type Group = Record<number, () => { render: (setting: unknown) => void }>;

function fakeText(initial = '') {
	let value = initial;
	let onChangeHandler: ((value: string) => void) | undefined;
	const blurHandlers: Array<() => void> = [];
	const text = {
		getValue: () => value,
		inputEl: {
			addClass: () => {},
			addEventListener: (event: string, fn: () => void) => {
				if (event === 'blur') blurHandlers.push(fn);
			},
			focus: () => {},
			removeClass: () => {},
		},
		onChange: (fn: (value: string) => void) => {
			onChangeHandler = fn;
			return text;
		},
		setPlaceholder: () => text,
		setValue: (next: string) => {
			value = next;
			return text;
		},
	};
	return {
		blur: () => blurHandlers.forEach((fn) => fn()),
		text,
		type: (next: string) => {
			value = next;
			onChangeHandler?.(next);
		},
	};
}

function fakeToggle(initial: boolean) {
	let onChangeHandler: ((value: boolean) => void) | undefined;
	let value = initial;
	const toggle = {
		change: (v: boolean) => onChangeHandler?.(v),
		onChange: (fn: (value: boolean) => void) => {
			onChangeHandler = fn;
			return toggle;
		},
		setValue: (v: boolean) => {
			value = v;
			return toggle;
		},
		value: () => value,
	};
	return toggle;
}

function fakeTogglableSetting() {
	const textHarness = fakeText();
	const toggleHarness = fakeToggle(false);
	const setting = {
		addText: (cb: (t: typeof textHarness.text) => void) => {
			cb(textHarness.text);
			return setting;
		},
		addToggle: (cb: (t: typeof toggleHarness) => void) => {
			cb(toggleHarness);
			return setting;
		},
		setClass: () => setting,
	};
	return { setting, textHarness, toggleHarness };
}

function baseCtx(overrides: Record<string, unknown> = {}) {
	const started: Array<true> = [];
	const stopped: Array<true> = [];
	const paused: Array<boolean> = [];
	return {
		paused,
		saveSettings: () => Promise.resolve(),
		setAutomaticSyncPaused: (value: boolean) => void paused.push(value),
		settings: {
			automaticSyncPaused: false,
			realtimeSync: { enabled: false, value: 0 },
			scheduledSync: { enabled: false, value: 3_600_000 },
			startupSync: { enabled: false, value: 0 },
		},
		speedLabel: () => ({ text: 'speed', tooltip: 'speed' }),
		startScheduledSync: () => void started.push(true),
		started,
		stopScheduledSync: () => void stopped.push(true),
		stopped,
		translate: ((key: string) => key) as never,
		...overrides,
	};
}

function group(ctx: ReturnType<typeof baseCtx>) {
	const tree = featuresSettings(ctx as never) as never as {
		[MORE]: { [PAGE.automaticSync]: Group };
	};
	return tree[MORE][PAGE.automaticSync];
}

test('the pause toggle reflects and updates automaticSyncPaused', () => {
	const ctx = baseCtx();
	const { setting, toggleHarness } = fakeTogglableSetting();
	group(ctx)[500]().render({
		addToggle: setting.addToggle,
	});

	expect(toggleHarness.value()).toBe(false);
	toggleHarness.change(true);
	expect(ctx.paused).toStrictEqual([true]);
});

test('changing the scheduled-sync interval restarts the schedule', () => {
	const ctx = baseCtx();
	const { setting, textHarness } = fakeTogglableSetting();
	group(ctx)[3000]().render(setting);

	textHarness.type('2h');
	textHarness.blur();
	expect(ctx.stopped).toStrictEqual([true]);
	expect(ctx.started).toStrictEqual([true]);
});

test('a zero scheduled-sync interval is rejected', () => {
	const ctx = baseCtx();
	const { setting, textHarness } = fakeTogglableSetting();
	group(ctx)[3000]().render(setting);

	textHarness.type('0');
	textHarness.blur();
	expect(ctx.settings.scheduledSync.value).toBe(3_600_000);
	expect(ctx.started).toStrictEqual([]);
});

test('toggling scheduled sync on or off starts or stops it', () => {
	const ctx = baseCtx();
	const { setting, toggleHarness } = fakeTogglableSetting();
	group(ctx)[3000]().render(setting);

	toggleHarness.change(true);
	expect(ctx.started).toStrictEqual([true]);
	expect(ctx.stopped).toStrictEqual([]);

	toggleHarness.change(false);
	expect(ctx.stopped).toStrictEqual([true]);
});
