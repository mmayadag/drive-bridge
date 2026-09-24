// The event bus: turns sync/general events into a running set of human-readable logs,
// tracks idle state, and disposes cleanly.

import { expect, test } from 'bun:test';
import EventBus from '@/modules/event-bus';

type Listener = (payload: never) => void;

function setup() {
	const bus = new EventBus();
	const dispatch = bus.root.dispatch as unknown as (event: string, payload?: unknown) => void;
	const on = bus.root.on as unknown as (event: string, listener: Listener) => () => void;
	return { bus, dispatch, on };
}

test('starts idle and flips busy while a sync is running', () => {
	const { bus, dispatch } = setup();

	expect(bus.root.isIdle()).toBe(true);
	dispatch('syncStarted', { trigger: 'manual' });
	expect(bus.root.isIdle()).toBe(false);
	dispatch('syncTerminated', { result: 'completed' });
	expect(bus.root.isIdle()).toBe(true);
});

test('logs the full lifecycle of a sync into getLogs', () => {
	const { bus, dispatch } = setup();

	dispatch('syncStarted', { trigger: 'manual' });
	dispatch('executionStarted', [{}, {}]);
	dispatch('taskCompleted', { key: 'note.md', name: 'upload' });
	dispatch('taskCompleted', { key: 'note2.md', name: 'upload' });
	dispatch('taskFailed', { error: 'boom', key: 'note3.md', name: 'download' });
	dispatch('logSync', 'custom info line');
	dispatch('errorSync', 'custom error line');
	dispatch('syncTerminated', { result: 'completed' });

	const logs = bus.root.getLogs();
	expect(logs).toContain('Trigger: `manual`');
	expect(logs).toContain('Execution of 2 sync task(s) started.');
	expect(logs).toContain('Task `upload` of `note.md` succeeded.');
	expect(logs).toContain('Task `upload` of `note2.md` succeeded.');
	expect(logs).toContain('Task `download` of `note3.md` failed with error: `boom`.');
	expect(logs).toContain('custom info line');
	expect(logs).toContain('custom error line');
	expect(logs).toContain('Outcome: `completed`');
	expect(logs).toContain('Total tasks: 2');
	expect(logs).toContain('Succeed: 2');
	expect(logs).toContain('Failed: 1');
	expect(logs).toContain('Duration:');
});

test('a failed sync logs its error and the outcome', () => {
	const { bus, dispatch } = setup();

	dispatch('syncStarted', { trigger: 'auto' });
	dispatch('syncTerminated', { error: 'disk full', result: 'failed' });

	const logs = bus.root.getLogs();
	expect(logs).toContain('Sync ended with error: `disk full`.');
	expect(logs).toContain('Outcome: `failed`');
});

test('confirmation and cancellation events add their own log lines', () => {
	const { bus, dispatch } = setup();

	dispatch('syncStarted', { trigger: 'manual' });
	dispatch('tasksConfirmed', [{}, {}, {}]);
	dispatch('deleteConfirmed', { delete: [{}], reupload: [{}, {}] });
	dispatch('massChangeConfirmed', true);
	dispatch('massChangeConfirmed', false);
	dispatch('massDeleteConfirmed', true);
	dispatch('massDeleteConfirmed', false);
	dispatch('syncCanceled');
	dispatch('syncTerminated', { result: 'cancelled' });

	const logs = bus.root.getLogs();
	expect(logs).toContain('Confirmed 3 task(s).');
	expect(logs).toContain('Confirmed to delete 1 files, reupload 2 files.');
	expect(logs).toContain('Mass change approved.');
	expect(logs).toContain('Mass change declined; sync stopped.');
	expect(logs).toContain('Mass deletion approved.');
	expect(logs).toContain('Mass deletion declined; files kept.');
	expect(logs).toContain('Sync is forced to stop.');
});

test('general logs are timestamped and kept separate from sync logs', () => {
	const { bus, dispatch } = setup();

	dispatch('moduleLoaded', 'gdrive');
	dispatch('logGeneral', 'plugin loaded');
	dispatch('errorGeneral', 'oops');

	const logs = bus.root.getLogs();
	expect(logs).toContain('General logs:');
	expect(logs).toContain('Module `gdrive` loaded.');
	expect(logs).toContain('plugin loaded');
	expect(logs).toContain('oops');
});

test('drops only its own oldest sync log once more than 100 syncs have run', () => {
	const { bus, dispatch } = setup();

	for (let i = 0; i < 101; i += 1) {
		dispatch('syncStarted', { trigger: `run-${i}` });
		dispatch('syncTerminated', { result: 'completed' });
	}

	const logs = bus.root.getLogs();
	expect(logs).not.toContain('Trigger: `run-0`');
	expect(logs).toContain('Trigger: `run-100`');
});

test('getLogs reports the plugin and Obsidian API versions', () => {
	const { bus } = setup();

	const logs = bus.root.getLogs();
	// Other test files mock `obsidian`'s Platform for their own purposes; that mock can leak
	// into this process-wide module cache, so the OS line is asserted only for its shape here.
	expect(logs).toMatch(/Obsidian API version: .+/u);
	expect(logs).toMatch(/Operating system: .+/u);
	expect(logs).toMatch(/Plugin version: .+/u);
});

test('dispose cancels an in-flight sync by dispatching syncCanceled', () => {
	const { bus, dispatch, on } = setup();
	let cancelled = false;
	on('syncCanceled', () => void (cancelled = true));

	dispatch('syncStarted', { trigger: 'manual' });
	bus.dispose();

	expect(cancelled).toBe(true);
});

test('dispose does nothing extra when already idle', () => {
	const { bus, on } = setup();
	let cancelled = false;
	on('syncCanceled', () => void (cancelled = true));

	bus.dispose();

	expect(cancelled).toBe(false);
});
