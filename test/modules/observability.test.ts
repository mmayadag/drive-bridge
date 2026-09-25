// The observability module: the sync commands, the ribbon buttons, the status bar text for
// each sync stage, the mobile notice, the last sync and history it records, and log export.

import type { Command } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { fakeApp } from '$/support/plugin-harness';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { LastSync } from '@/modules/observability';
import type { SyncSummary } from '@/sync/history';

// Modals are captured instead of shown; notices are recorded.
const modals: Array<{ options: Record<string, unknown> }> = [];
const notices: Array<{ message: string; hidden: boolean; messages: Array<string> }> = [];

class CapturingModal extends ObsidianMock.Modal {
	override open() {
		modals.push(this as unknown as { options: Record<string, unknown> });
	}
}

class RecordingNotice {
	readonly record: { message: string; hidden: boolean; messages: Array<string> };
	constructor(message: string) {
		this.record = { hidden: false, message, messages: [] };
		notices.push(this.record);
	}
	hide() {
		this.record.hidden = true;
	}
	setMessage(message: string) {
		this.record.messages.push(message);
		return this;
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: CapturingModal,
	Notice: RecordingNotice,
}));

const { default: Observability } = await import('@/modules/observability');
const { ref } = await import('@/shared/reactive');

// Timers are captured instead of run, so each test fires them when it wants.
type Timer = { callback: () => void; delay: number };
let timers: Array<Timer | undefined> = [];
const real = {
	clearInterval: globalThis.clearInterval,
	clearTimeout: globalThis.clearTimeout,
	setInterval: globalThis.setInterval,
	setTimeout: globalThis.setTimeout,
};
const realPlatform = { ...ObsidianMock.Platform };
const clipboard: Array<string> = [];

beforeEach(() => {
	timers = [];
	modals.length = 0;
	notices.length = 0;
	clipboard.length = 0;
	const capture = (callback: () => void, delay: number) => timers.push({ callback, delay });
	const clear = (id: number) => (timers[id - 1] = undefined);
	Object.assign(globalThis, {
		clearInterval: clear,
		clearTimeout: clear,
		setInterval: capture,
		setTimeout: capture,
	});
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: (text: string) => Promise.resolve(void clipboard.push(text)) },
	});
});

afterEach(() => {
	Object.assign(globalThis, real);
	Object.assign(ObsidianMock.Platform, realPlatform);
});

const flush = () =>
	new Promise((resolve) => {
		real.setTimeout(resolve, 0);
	});

type Handler = (payload: never) => void;

function setup(settingsOverrides: Record<string, unknown> = {}) {
	const fake = fakeApp();
	const handlers = new Map<string, Array<Handler>>();
	const commands: Array<Command> = [];
	const ribbon: Array<{ icon: string; title: string; el: HTMLElement; click: () => void }> = [];
	const statusBar: Array<HTMLElement> = [];
	const requested: Array<string> = [];
	const dispatched: Array<[string, unknown]> = [];
	const paused: Array<boolean> = [];
	let progressShown = 0;
	let saves = 0;
	const isIdle = ref(true);
	const ctx = {
		addCommand: (command: Command) => {
			commands.push(command);
			return command;
		},
		addRibbonIcon: (icon: string, title: string, callback: () => void) => {
			const el = createDiv();
			el.createSvg('svg');
			ribbon.push({ click: callback, el, icon, title });
			return el;
		},
		addStatusBarItem: () => {
			const el = createDiv();
			statusBar.push(el);
			return el;
		},
		app: fake.app,
		dispatch: (name: string, payload?: unknown) => void dispatched.push([name, payload]),
		getLogs: () => 'the log',
		isIdle,
		on: (name: string, handler: Handler) => {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
			return () =>
				handlers.set(
					name,
					list.filter((item) => item !== handler),
				);
		},
		requestSync: (trigger: string) => {
			requested.push(trigger);
			return Promise.resolve({ result: 'completed' });
		},
		saveSettings: () => Promise.resolve(void saves++),
		setAutomaticSyncPaused: (value: boolean) => void paused.push(value),
		showProgress: () => void progressShown++,
		translate: (key: string, arg?: unknown) =>
			arg === undefined ? key : `${key}(${JSON.stringify(arg)})`,
	};
	const observability = new Observability(ctx as never);
	const settings = {
		automaticSyncPaused: false,
		exportLogsDirectory: 'Drive Bridge Logs/',
		lastSync: undefined as LastSync | undefined,
		noticeStatusOnMobile: true,
		scheduledSync: { enabled: true, value: 60_000 },
		skipState: { failures: {}, skipped: [] as Array<string> },
		syncHistory: [] as Array<SyncSummary>,
		...settingsOverrides,
	};
	Object.assign(observability, { settings });
	observability.start();
	const emit = (name: string, payload?: unknown) => {
		for (const handler of handlers.get(name) ?? []) handler(payload as never);
	};
	const command = (id: string) => {
		const found = commands.find((item) => item.id === id);
		if (!found) throw new Error(`No command ${id}`);
		return found;
	};
	const status = () => statusBar[0].querySelector('.drive-bridge-status-text')?.textContent;
	return {
		...fake,
		command,
		commands,
		dispatched,
		emit,
		handlers,
		isIdle,
		observability,
		paused,
		progressShown: () => progressShown,
		requested,
		ribbon,
		saves: () => saves,
		settings,
		status,
		statusBar,
	};
}

test('start adds the sync, history, log and report commands', () => {
	const { commands } = setup();
	expect(commands.map((command) => command.id)).toEqual([
		'start-sync',
		'start-non-interactive-sync',
		'stop-sync',
		'show-progress',
		'pause-automatic-sync',
		'resume-automatic-sync',
		'show-sync-history',
		'show-sync-log',
		'copy-problem-report',
		'export-logs',
	]);
});

test('the start commands are offered while idle and request a sync', () => {
	const { command, isIdle, requested } = setup();
	for (const [id, trigger] of [
		['start-sync', 'manual'],
		['start-non-interactive-sync', 'nonInteractiveManual'],
	]) {
		const { checkCallback } = command(id);
		isIdle(true);
		expect(checkCallback?.(true)).toBe(true);
		isIdle(false);
		expect(checkCallback?.(true)).toBe(false);
		checkCallback?.(false);
		expect(requested.at(-1)).toBe(trigger);
	}
});

test('stop and show progress are offered only during a sync', () => {
	const { command, isIdle, dispatched, progressShown } = setup();
	for (const id of ['stop-sync', 'show-progress']) {
		isIdle(true);
		expect(command(id).checkCallback?.(true)).toBe(false);
		isIdle(false);
		expect(command(id).checkCallback?.(true)).toBe(true);
		command(id).checkCallback?.(false);
	}
	expect(dispatched).toContainEqual(['syncCanceled', undefined]);
	expect(progressShown()).toBe(1);
});

test('pause and resume are offered by the paused state and change it', () => {
	const { command, settings, paused } = setup();
	expect(command('pause-automatic-sync').checkCallback?.(true)).toBe(true);
	expect(command('resume-automatic-sync').checkCallback?.(true)).toBe(false);
	settings.automaticSyncPaused = true;
	expect(command('pause-automatic-sync').checkCallback?.(true)).toBe(false);
	expect(command('resume-automatic-sync').checkCallback?.(true)).toBe(true);
	command('pause-automatic-sync').checkCallback?.(false);
	command('resume-automatic-sync').checkCallback?.(false);
	expect(paused).toEqual([true, false]);
});

test('the history command opens the history, which describes each sync', () => {
	const { command, settings } = setup();
	const counts = {
		conflicts: 0,
		deletedHere: 0,
		deletedOnDrive: 0,
		downloaded: 2,
		failed: 0,
		uploaded: 1,
	};
	settings.syncHistory.push(
		{ at: 0, counts, result: 'completed', trigger: 'manual' },
		{ at: 0, counts, error: 'boom', result: 'failed', trigger: 'interval' },
	);
	command('show-sync-history').callback?.();
	expect(modals).toHaveLength(1);
	const options = modals[0].options as {
		history: Array<SyncSummary>;
		showLog: () => void;
		texts: {
			describe: (summary: SyncSummary) => { heading: string; detail: string };
			empty: string;
			showLog: string;
			title: string;
		};
	};
	expect(options.history).toBe(settings.syncHistory);
	expect(options.texts).toMatchObject({
		empty: 'historyEmpty',
		showLog: 'syncLog',
		title: 'syncHistory',
	});
	const [completed, failed] = settings.syncHistory.map(options.texts.describe);
	expect(completed.heading).toEndWith(' · completed · manual');
	expect(completed.detail).toBe(`historyCounts(${JSON.stringify(counts)})`);
	expect(failed.heading).toEndWith(' · failed · interval');
	expect(failed.detail).toEndWith(' · boom');

	// The history links to the log.
	options.showLog();
	expect(modals).toHaveLength(2);
	expect(modals[1].options).toStrictEqual({
		copied: 'logCopied',
		copy: 'copyLog',
		log: 'the log',
		title: 'syncLog',
	});
});

test('the log command opens the log', () => {
	const { command } = setup();
	command('show-sync-log').callback?.();
	expect(modals[0].options).toMatchObject({ log: 'the log', title: 'syncLog' });
});

test('the problem report command copies a report with the log', async () => {
	const { command } = setup();
	command('copy-problem-report').callback?.();
	await flush();
	expect(clipboard).toHaveLength(1);
	expect(clipboard[0]).toContain('the log');
	expect(notices.map((notice) => notice.message)).toEqual(['problemReportCopied']);
});

test('export logs writes the log into a new note in the logs folder and opens it', async () => {
	const { command, files, folders, opened } = setup({ exportLogsDirectory: 'Logs/Sync/' });
	command('export-logs').callback?.();
	await flush();
	expect([...folders]).toEqual(['Logs', 'Logs/Sync']);
	const [[path, content]] = [...files];
	expect(path).toMatch(/^Logs\/Sync\/\d{4}-\d\d-\d\dT[\d-]+Z\.md$/u);
	expect(content).toBe('the log');
	expect(opened).toEqual([{ path }]);
});

test('export logs to the vault root creates no folder', async () => {
	const { observability, files, folders } = setup({ exportLogsDirectory: '/' });
	await observability.root.exportLogs();
	expect(folders.size).toBe(0);
	expect([...files.keys()][0]).toMatch(/^\d{4}-.*\.md$/u);
});

test('a failed export shows a notice and reports the error', async () => {
	const { observability, app, dispatched } = setup();
	app.vault.create = () => Promise.reject(new Error('disk full'));
	await observability.root.exportLogs();
	expect(notices.map((notice) => notice.message)).toEqual(['exportLogsFailed: disk full']);
	expect(dispatched).toContainEqual(['errorGeneral', 'Export log failed: `disk full`.']);
});

test('the ribbon starts a sync while idle and stops one while busy', () => {
	const { ribbon, isIdle, requested, dispatched } = setup();
	const [start, stop] = ribbon;
	expect([start.icon, start.title, stop.icon, stop.title]).toEqual([
		'refresh-cw',
		'startSync',
		'square',
		'stopSync',
	]);
	expect(start.el.hasClass('drive-bridge-ribbon-action')).toBe(true);
	expect(stop.el.isShown()).toBe(false);

	start.click();
	expect(requested).toEqual(['manual']);

	isIdle(false);
	expect(start.el.getAttribute('aria-disabled')).toBe('true');
	expect(start.el.firstElementChild?.hasClass('drive-bridge-spin')).toBe(true);
	expect(stop.el.isShown()).toBe(true);
	start.click();
	expect(requested).toEqual(['manual']);
	stop.click();
	expect(dispatched).toContainEqual(['syncCanceled', undefined]);

	isIdle(true);
	expect(start.el.hasAttribute('aria-disabled')).toBe(false);
	expect(start.el.firstElementChild?.hasClass('drive-bridge-spin')).toBe(false);
});

test('a ribbon icon without its svg is left alone', () => {
	const { ribbon, isIdle } = setup();
	ribbon[0].el.empty();
	isIdle(false);
	expect(ribbon[1].el.isShown()).toBe(false);
});

test('the status bar spins while syncing and shows each stage', () => {
	const { statusBar, status, isIdle, emit } = setup();
	const icon = statusBar[0].firstElementChild;
	expect(status()).toBe('idle');
	isIdle(false);
	expect(icon?.hasClass('drive-bridge-spin')).toBe(true);

	emit('syncStarted', { trigger: 'manual' });
	expect(status()).toBe('walkingRemote 0/1');
	emit('remoteWalkProgress', { completed: 3, total: 10 });
	expect(status()).toBe('walkingRemote 3/10');
	for (const name of [
		'requestConfirmDelete',
		'requestConfirmTasks',
		'requestConfirmMassDelete',
		'requestConfirmMassChange',
	]) {
		emit('syncStarted', { trigger: 'manual' });
		emit(name);
		expect(status()).toBe('awaitingConfirmation');
	}
	emit('executionStarted', [{ name: 'upload' }, { name: 'download' }]);
	expect(status()).toBe('executing 0%');
	emit('taskCompleted', { key: 'a.md' });
	expect(status()).toBe('executing 50%');
	isIdle(true);
	expect(icon?.hasClass('drive-bridge-spin')).toBe(false);
});

test('a status bar item without its icon is left alone', () => {
	const { statusBar, isIdle } = setup();
	statusBar[0].firstElementChild?.remove();
	expect(() => isIdle(false)).not.toThrow();
});

test('a completed sync records the last sync and its history, then counts the time since', () => {
	const { emit, status, settings, saves, observability } = setup();
	settings.skipState.skipped.push('big.pdf');
	emit('syncStarted', { trigger: 'interval' });
	emit('executionStarted', [{ name: 'upload' }, { name: 'download' }, { name: 'mkdirLocal' }]);
	emit('taskFailed');
	emit('syncTerminated', { result: 'completed' });

	expect(status()).toBe('completed');
	expect(settings.lastSync).toMatchObject({ result: 'completed', skipped: 1 });
	expect(settings.syncHistory).toHaveLength(1);
	expect(settings.syncHistory[0]).toMatchObject({
		counts: { downloaded: 1, failed: 1, uploaded: 1 },
		result: 'completed',
		trigger: 'interval',
	});
	expect(saves()).toBe(1);

	const interval = timers.findLast((timer) => timer?.delay === 60_000);
	interval?.callback();
	expect(status()).toMatch(/^completed \d+\w+ ago$/u);

	// Two scheduled intervals without a sync: overdue, unless automatic sync is paused.
	Object.assign(observability, { lastSyncTime: Date.now() - 3 * 60_000 });
	interval?.callback();
	expect(status()).toMatch(/ · syncOverdue$/u);
	emit('automaticSyncPausedChanged', true);
	expect(status()).toMatch(/ · automaticSyncPausedStatus$/u);
	expect(status()).not.toContain('syncOverdue');
	emit('automaticSyncPausedChanged', false);
	expect(status()).toMatch(/^completed \d+\w+ ago$/u);
});

test('a sync with nothing to do, a cancelled and a failed sync show their result', () => {
	const { emit, status, settings } = setup({ automaticSyncPaused: true });
	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'noop' });
	expect(status()).toBe('completedNoop · automaticSyncPausedStatus');
	expect(timers.some((timer) => timer?.delay === 60_000)).toBe(true);

	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'cancelled' });
	expect(status()).toBe('cancelled · automaticSyncPausedStatus');

	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { error: 'boom', result: 'failed' });
	expect(status()).toBe('failed: boom · automaticSyncPausedStatus');
	expect(settings.lastSync).toMatchObject({ error: 'boom', result: 'failed' });
	expect(settings.lastSync?.skipped).toBeUndefined();
	expect(settings.syncHistory.map((summary) => summary.result)).toEqual([
		'failed',
		'cancelled',
		'noop',
	]);
});

test('on a phone a notice follows the sync and hides shortly after it ends', () => {
	Object.assign(ObsidianMock.Platform, { isDesktop: false, isMobile: true });
	const { emit } = setup();
	emit('syncStarted', { trigger: 'manual' });
	expect(notices).toHaveLength(1);
	expect(notices[0].message).toBe('walkingRemote 0/1');
	emit('remoteWalkProgress', { completed: 1, total: 2 });
	expect(notices[0].messages.at(-1)).toBe('walkingRemote 1/2');

	emit('syncTerminated', { result: 'cancelled' });
	const hide = timers.findLast((timer) => timer?.delay === 2000);
	expect(notices[0].hidden).toBe(false);
	hide?.callback();
	expect(notices[0].hidden).toBe(true);

	// The next sync gets a fresh notice.
	emit('syncStarted', { trigger: 'manual' });
	expect(notices).toHaveLength(2);
});

test('the phone notice can be turned off', () => {
	Object.assign(ObsidianMock.Platform, { isDesktop: false, isMobile: true });
	const { emit } = setup({ noticeStatusOnMobile: false });
	emit('syncStarted', { trigger: 'manual' });
	expect(notices).toHaveLength(0);
});

test('root exposes the progress refs and the modals', () => {
	const { observability, emit } = setup();
	emit('syncStarted', { trigger: 'manual' });
	expect(observability.root.syncStage()).toBe('walkingRemote');
	expect(observability.root.walkProgress()).toStrictEqual({ completed: 0, total: 1 });
	expect(observability.root.executionProgress()).toStrictEqual({ completed: 0, total: 0 });
	observability.root.showSyncLog();
	observability.root.showSyncHistory();
	expect(modals).toHaveLength(2);
});

test('dispose unsubscribes, stops the timers and leaves the status alone', () => {
	const { observability, emit, status, handlers } = setup();
	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'completed' });
	observability.dispose();
	expect([...handlers.values()].every((list) => list.length === 0)).toBe(true);
	expect(timers.every((timer) => timer === undefined)).toBe(true);
	emit('syncStarted', { trigger: 'manual' });
	expect(status()).toBe('completed');
});
