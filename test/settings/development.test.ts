// The Development settings block: clearing records, retrying skipped files, exporting
// logs, and resetting to defaults. No real DOM is available in this test environment, so
// `setting`/`button`/`text` are duck-typed to just what development.ts touches, and the
// confirm modal is replaced with a stub that hands back its options directly.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';

const notices: Array<string> = [];
function NoticeSpy(message: string) {
	notices.push(message);
}

void mock.module('obsidian', () => ({ ...ObsidianMock, Notice: NoticeSpy }));

type ConfirmOptions = {
	title: string;
	message: string;
	confirm: string;
	cancel: string;
	onConfirm: () => unknown;
	onCancel?: () => unknown;
};
const modals: Array<ConfirmOptions> = [];
class ConfirmModalSpy {
	opened = false;
	constructor(
		_app: unknown,
		private readonly options: ConfirmOptions,
	) {
		modals.push(options);
	}
	open() {
		this.opened = true;
	}
}

void mock.module('@/components/confirm-modal', () => ({ default: ConfirmModalSpy }));

const { default: developmentSettings } = await import('@/settings/development');

type Group = Record<number, () => { render: (setting: never) => void }>;

function baseSettings() {
	return {
		exportLogsDirectory: 'Drive Bridge Logs/',
		scheduledSync: { enabled: false },
		skipState: { failures: {}, skipped: [] as Array<string> },
	};
}

function baseCtx(overrides: Record<string, unknown> = {}) {
	const saved: Array<true> = [];
	return {
		app: { vault: { configDir: '.obsidian' } } as never,
		deleteRecordStore: () => Promise.resolve(),
		exportLogs: () => Promise.resolve(),
		memoryDB: { getStore: () => ({ clear: () => {} }) },
		rerenderSettingTab: () => {},
		resetModuleSettings: () => {},
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		savedCalls: saved,
		settings: baseSettings(),
		startScheduledSync: () => {},
		stopScheduledSync: () => {},
		translate: ((key: string, arg?: number) =>
			arg === undefined ? key : `${key}:${arg}`) as never,
		...overrides,
	};
}

function tree(ctx: ReturnType<typeof baseCtx>) {
	return developmentSettings(ctx as never) as never as {
		[MORE]: { [PAGE.advanced]: { [ADVANCED.development]: Group; [ADVANCED.reset]: Group } };
	};
}

function developmentGroup(ctx: ReturnType<typeof baseCtx>) {
	return tree(ctx)[MORE][PAGE.advanced][ADVANCED.development];
}

function fakeButton() {
	const calls: { setButtonText: Array<string>; setDisabled: Array<boolean> } = {
		setButtonText: [],
		setDisabled: [],
	};
	let onClickHandler: (() => unknown) | undefined;
	const button = {
		calls,
		onClick: (fn: () => unknown) => {
			onClickHandler = fn;
			return button;
		},
		setButtonText: (text: string) => {
			calls.setButtonText.push(text);
			return button;
		},
		setDestructive: () => button,
		setDisabled: (value: boolean) => {
			calls.setDisabled.push(value);
			return button;
		},
		trigger: () => onClickHandler?.(),
	};
	return button;
}

test('clearing records opens a confirm modal, and confirming clears the store', async () => {
	modals.length = 0;
	const ctx = baseCtx();
	const button = fakeButton();
	developmentGroup(ctx)[1000]().render({
		addButton: (cb: (b: typeof button) => void) => cb(button),
	} as never);

	button.trigger();
	expect(modals).toHaveLength(1);
	expect(modals[0]?.title).toBe('clearRecords');

	await modals[0]?.onConfirm();
	expect(notices).toContain('recordsCleared');
});

test('the retry button is disabled with nothing skipped, and clears the skip state', async () => {
	const skippedCtx = baseCtx({
		settings: { ...baseSettings(), skipState: { failures: {}, skipped: ['a.md'] } },
	});
	const button = fakeButton();
	developmentGroup(skippedCtx)[1500]().render({
		addButton: (cb: (b: typeof button) => void) => cb(button),
	} as never);

	expect(button.calls.setDisabled).toStrictEqual([false]);
	await button.trigger();
	expect(skippedCtx.settings.skipState).toStrictEqual({ failures: {}, skipped: [] });
	expect(notices).toContain('skippedFilesCleared');

	const emptyCtx = baseCtx();
	const emptyButton = fakeButton();
	developmentGroup(emptyCtx)[1500]().render({
		addButton: (cb: (b: typeof emptyButton) => void) => cb(emptyButton),
	} as never);
	expect(emptyButton.calls.setDisabled).toStrictEqual([true]);
});

test('the export row normalizes the typed directory on blur and exports on click', async () => {
	const ctx = baseCtx();
	let exported = false;
	ctx.exportLogs = () => {
		exported = true;
		return Promise.resolve();
	};
	const button = fakeButton();
	let blurHandler: (() => void) | undefined;
	const text = {
		getValue: () => '  logs//  ',
		inputEl: {
			addEventListener: (event: string, fn: () => void) => {
				if (event === 'blur') blurHandler = fn;
			},
		},
		setPlaceholder: () => text,
		setValue: () => text,
	};
	const setting = {
		addButton: (cb: (b: typeof button) => void) => {
			cb(button);
			return setting;
		},
		addText: (cb: (t: typeof text) => void) => {
			cb(text);
			return setting;
		},
	};
	developmentGroup(ctx)[2000]().render(setting as never);

	blurHandler?.();
	expect(ctx.settings.exportLogsDirectory).not.toBe('Drive Bridge Logs/');
	expect(ctx.savedCalls).toHaveLength(1);

	await button.trigger();
	expect(exported).toBe(true);
});

test('resetting to defaults opens a confirm modal, and confirming resets and restarts sync', async () => {
	modals.length = 0;
	const ctx = baseCtx({ settings: { ...baseSettings(), scheduledSync: { enabled: true } } });
	let started = false;
	let stopped = false;
	ctx.startScheduledSync = () => void (started = true);
	ctx.stopScheduledSync = () => void (stopped = true);
	const button = fakeButton();
	const resetGroup = tree(ctx)[MORE][PAGE.advanced][ADVANCED.reset];
	resetGroup[1000]().render({
		addButton: (cb: (b: typeof button) => void) => cb(button),
	} as never);

	button.trigger();
	expect(modals).toHaveLength(1);

	await modals[0]?.onConfirm();
	expect(stopped).toBe(true);
	expect(started).toBe(true);
	expect(notices).toContain('settingsReset');
});
