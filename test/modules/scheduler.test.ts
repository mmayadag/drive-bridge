import ObsidianMock from '$/support/obsidian-mock';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);
const { default: Scheduler } = await import('@/modules/scheduler');
const { ref } = await import('@/shared/reactive');

// Timers are captured instead of run, so each test fires them when it wants.
type Timer = { callback: () => void; delay: number; repeat: boolean };
let timers: Array<Timer> = [];
const real = {
	clearInterval: globalThis.clearInterval,
	clearTimeout: globalThis.clearTimeout,
	setInterval: globalThis.setInterval,
	setTimeout: globalThis.setTimeout,
};
const listeners = new Map<string, () => void>();
let hidden = false;

beforeEach(() => {
	timers = [];
	listeners.clear();
	hidden = false;
	Object.assign(globalThis, {
		// Browsers hand out timer ids from 1; the scheduler treats 0 as no timer.
		clearInterval: (id: number) => void (timers[id - 1] = undefined as never),
		clearTimeout: (id: number) => void (timers[id - 1] = undefined as never),
		document: {
			addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
			get hidden() {
				return hidden;
			},
			removeEventListener: (name: string) => listeners.delete(name),
		},
		setInterval: (callback: () => void, delay: number) =>
			timers.push({ callback, delay, repeat: true }),
		setTimeout: (callback: () => void, delay: number) =>
			timers.push({ callback, delay, repeat: false }),
	});
	globalThis.addEventListener = ((name: string, fn: () => void) =>
		listeners.set(name, fn)) as never;
	globalThis.removeEventListener = ((name: string) => listeners.delete(name)) as never;
});

afterEach(() => {
	Object.assign(globalThis, real);
	delete (globalThis as { document?: unknown }).document;
});

const flush = () =>
	new Promise((resolve) => {
		real.setTimeout(resolve, 0);
	});

function scheduler(settings: Record<string, unknown> = {}) {
	const logs: Array<string> = [];
	const runs: Array<{ trigger: string; options?: unknown }> = [];
	const isIdle = ref(true);
	const syncStage = ref<string>('none');
	const instance = new Scheduler({
		app: {
			vault: { on: () => ({}) },
			workspace: { onLayoutReady: (fn: () => void) => fn() },
		},
		dispatch: (event: string, payload: string) => {
			if (event === 'logGeneral') logs.push(payload);
		},
		executeSync: (trigger: string, options?: unknown) => {
			runs.push({ options, trigger });
			isIdle(true);
			return Promise.resolve({ result: 'completed' });
		},
		isIdle,
		reduceTriggers: (triggers: Array<string>) => ({ trigger: triggers.join('+') }),
		registerEvent: () => {},
		saveSettings: () => Promise.resolve(),
		syncStage,
	} as never);
	Object.assign(instance, {
		settings: {
			automaticSyncPaused: false,
			avoidAutoSyncWhenOffline: false,
			exclusionRules: [{ caseSensitive: false, expr: '.trash' }],
			inclusionRules: [],
			realtimeSync: { enabled: true, value: 5000 },
			scheduledSync: { enabled: true, value: 60_000 },
			startupSync: { enabled: true, value: 1000 },
			syncOnLeave: true,
			...settings,
		},
	});
	const change = (path: string, old?: string) =>
		(
			instance as unknown as { onChange: (file: { path: string }, old?: string) => void }
		).onChange({ path }, old);
	return { change, instance, isIdle, logs, runs, syncStage };
}

test('a paused device skips automatic syncs but runs manual ones', async () => {
	const { instance, logs, runs } = scheduler({ automaticSyncPaused: true });
	expect(await instance.root.requestSync('interval')).toStrictEqual({ result: 'cancelled' });
	expect(logs[0]).toContain('paused');
	expect(await instance.root.requestSync('manual')).toStrictEqual({ result: 'completed' });
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['manual']);
});

test('resuming lets automatic syncs run again', async () => {
	const { instance, runs } = scheduler({ automaticSyncPaused: true });
	instance.root.setAutomaticSyncPaused(false);
	await instance.root.requestSync('interval');
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['interval']);
});

test('offline, automatic syncs are skipped when asked to, manual ones are not', async () => {
	const onLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
	Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
	try {
		const { instance, runs } = scheduler({ avoidAutoSyncWhenOffline: true });
		expect(await instance.root.requestSync('interval')).toStrictEqual({
			error: 'Device is offline.',
			result: 'failed',
		});
		await instance.root.requestSync('manual');
		expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['manual']);
	} finally {
		if (onLine) Object.defineProperty(navigator, 'onLine', onLine);
		else delete (navigator as { onLine?: boolean }).onLine;
	}
});

test('startup sync runs after its delay, then the schedule starts', async () => {
	const { instance, runs } = scheduler();
	instance.start();
	const startup = timers.find((timer) => !timer.repeat);
	expect(startup?.delay).toBe(1000);
	expect(timers.some((timer) => timer?.repeat)).toBe(false);
	startup?.callback();
	await flush();
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['startup']);
	await flush();
	const schedule = timers.find((timer) => timer?.repeat);
	expect(schedule?.delay).toBe(60_000);
	schedule?.callback();
	await flush();
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['startup', 'interval']);
	instance.dispose();
});

test('without a startup sync the schedule starts at once', () => {
	const { instance } = scheduler({ startupSync: { enabled: false, value: 0 } });
	instance.start();
	expect(timers.filter((timer) => timer?.repeat).map((timer) => timer.delay)).toStrictEqual([
		60_000,
	]);
	instance.dispose();
});

test('a change schedules a realtime sync; excluded paths do not', async () => {
	const { change, runs } = scheduler();
	change('.trash/old.md');
	expect(timers).toHaveLength(0);
	change('notes/a.md');
	change('notes/b.md');
	// A second change restarts the delay instead of adding a sync.
	const pending = timers.filter(Boolean);
	expect(pending).toHaveLength(1);
	expect(pending[0]?.delay).toBe(5000);
	pending[0]?.callback();
	await flush();
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['realtime']);
});

test('moving a file out of an excluded folder counts as a change', () => {
	const { change } = scheduler();
	change('notes/a.md', '.trash/a.md');
	expect(timers.filter(Boolean)).toHaveLength(1);
});

test('changes made by a running sync are ignored', () => {
	const { change, syncStage } = scheduler();
	syncStage('executing');
	change('notes/a.md');
	expect(timers).toHaveLength(0);
});

test('leaving Obsidian syncs once when there are local changes', async () => {
	const { change, instance, runs } = scheduler({ realtimeSync: { enabled: false, value: 0 } });
	instance.start();
	listeners.get('blur')?.();
	await flush();
	expect(runs).toHaveLength(0);
	change('notes/a.md');
	listeners.get('blur')?.();
	await flush();
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['leave']);
	// Coming back and leaving again right away does not sync again.
	change('notes/b.md');
	hidden = true;
	listeners.get('visibilitychange')?.();
	await flush();
	expect(runs).toHaveLength(1);
	instance.dispose();
	expect(listeners.size).toBe(0);
});

test('requests made while a sync runs are merged into one', async () => {
	const { instance, isIdle, runs } = scheduler();
	isIdle(false);
	const first = instance.root.requestSync('interval');
	const second = instance.root.requestSync('realtime');
	isIdle(true);
	expect(await first).toStrictEqual({ result: 'completed' });
	expect(await second).toStrictEqual({ result: 'completed' });
	expect(runs.map(({ trigger }) => trigger)).toStrictEqual(['interval+realtime']);
});

test('closing the plugin cancels waiting requests', async () => {
	const { instance, isIdle } = scheduler();
	isIdle(false);
	const waiting = instance.root.requestSync('interval');
	instance.dispose();
	expect(await waiting).toStrictEqual({ result: 'cancelled' });
});
