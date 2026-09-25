// Drives whole syncs through the Sync module with an in-memory vault, Drive and record store.

import type { MemoryFs } from '$/support/memory-fs';
import type { Command } from 'obsidian';
import { memoryFs, memoryRecords } from '$/support/memory-fs';
import { NoticeSpy, notices, resetSpies } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import testKit from '$/support/test-kit';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { SyncOptions, SyncTerminateReason } from '@/modules/sync';
import type { BaseTask, RemoveLocal } from '@/sync';
import type { RecordStat } from '@/types';

void mock.module('obsidian', () => ({ ...ObsidianMock, Notice: NoticeSpy }));
const { default: Sync } = await import('@/modules/sync');
const { bidirectionalDecider, keepLocalResolver } = await import('@/sync');
const { ref } = await import('@/shared/reactive');
const { TFile } = await import('obsidian');

const { deferred, flush } = testKit;

beforeEach(resetSpies);

type Listener = (payload: never) => void;

const uidOf = (side: MemoryFs, key: string) => side.files.get(key)?.uid ?? '';
type Setup = {
	local?: Record<string, string>;
	remote?: Record<string, string>;
	/** Files and folders on both sides, with records, as after an earlier sync. */
	synced?: Record<string, string>;
	settings?: Record<string, unknown>;
};

function setup({ local = {}, remote = {}, synced = {}, settings = {} }: Setup = {}) {
	const localFs = memoryFs('local', { ...synced, ...local });
	const remoteFs = memoryFs('remote', { ...synced, ...remote });
	const initial: Record<string, RecordStat> = {};
	for (const key of Object.keys(synced))
		initial[key] = key.endsWith('/')
			? { isDir: true }
			: {
					isDir: false,
					local: uidOf(localFs, key),
					remote: uidOf(remoteFs, key),
				};
	const records = memoryRecords(initial);

	const events: Array<[string, unknown]> = [];
	const listeners = new Map<string, Set<Listener>>();
	const on = (event: string, callback: Listener) => {
		const set = listeners.get(event) ?? new Set();
		listeners.set(event, set);
		set.add(callback);
		return () => void set.delete(callback);
	};
	const dispatch = (event: string, payload?: unknown) => {
		events.push([event, payload]);
		for (const callback of listeners.get(event) ?? []) callback(payload as never);
	};

	const commands: Array<Command> = [];
	const workspaceEvents = new Map<string, (...args: Array<never>) => void>();
	const workspace = {
		activeFile: undefined as unknown,
		getActiveFile: () => workspace.activeFile,
		getMostRecentLeaf: () => {},
		on: (name: string, callback: (...args: Array<never>) => void) => {
			workspaceEvents.set(name, callback);
			return {};
		},
		onLayoutReady: (callback: () => void) => callback(),
	};
	let saves = 0;
	const isIdle = ref(true);
	const sync = new Sync({
		addCommand: (command: Command) => {
			commands.push(command);
			return command;
		},
		app: { workspace },
		dispatch,
		getConflictResolver: () => keepLocalResolver,
		getDecider: () => bidirectionalDecider,
		initializeSync: () => ({
			localFs: localFs.fs,
			record: records.store,
			remoteFs: remoteFs.fs,
		}),
		isIdle,
		on,
		registerEvent: () => {},
		saveSettings: () => {
			saves += 1;
			return Promise.resolve();
		},
		translate: (key: string, ...args: Array<string>) =>
			args.length ? `${key} ${args.join(' ')}` : key,
	} as never);
	const state = {
		exclusionRules: [],
		inclusionRules: [],
		keptOnRemote: {},
		maxFileSize: { enabled: false, value: 0 },
		neverDeleteRemote: false,
		skipState: { failures: {}, skipped: [] },
		...settings,
	} as {
		keptOnRemote: Record<string, string>;
		skipState: { failures: Record<string, number>; skipped: Array<string> };
	};
	Object.assign(sync, { settings: state });

	const run = (trigger = 'manual', options?: SyncOptions): Promise<SyncTerminateReason> =>
		sync.root.executeSync(trigger, options);
	const named = (name: string) =>
		events.filter(([event]) => event === name).map(([, payload]) => payload);
	const logs = () => named('logSync') as Array<string>;
	return {
		commands,
		dispatch,
		events,
		isIdle,
		localFs,
		logs,
		named,
		on,
		records: records.values,
		remoteFs,
		run,
		saves: () => saves,
		settings: state,
		sync,
		workspace,
		workspaceEvents,
	};
}

const keys = (tasks: unknown) =>
	(tasks as Array<BaseTask>).map((task) => `${task.name} ${task.key}`);
const many = (count: number, prefix = 'n') =>
	Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}.md`, `text ${i}`]));

test('a two-way sync copies each side to the other and records every item', async () => {
	const s = setup({ local: { 'a.md': 'A', 'dir/': '' }, remote: { 'b.md': 'B' } });

	expect(await s.run()).toStrictEqual({ result: 'completed' });

	expect(s.remoteFs.text('a.md')).toBe('A');
	expect(s.remoteFs.folders.has('dir/')).toBe(true);
	expect(s.localFs.text('b.md')).toBe('B');
	expect([...s.records.keys()].toSorted()).toStrictEqual(['a.md', 'b.md', 'dir/']);
	expect(s.records.get('a.md')).toStrictEqual({
		isDir: false,
		local: uidOf(s.localFs, 'a.md'),
		remote: uidOf(s.remoteFs, 'a.md'),
	});
	expect(s.events.map(([event]) => event)).toContain('syncInitialized');
	expect(s.named('syncStarted')).toMatchObject([{ trigger: 'manual' }]);
	expect(keys(s.named('executionStarted')[0])).toStrictEqual([
		'createRemoteDir dir/',
		'upload a.md',
		'download b.md',
	]);
	expect(s.named('taskCompleted')).toContainEqual({
		isDir: true,
		key: 'dir/',
		name: 'createRemoteDir',
		prettyName: 'createRemoteDir',
	});
	expect(s.named('taskCompleted')).toHaveLength(3);
	expect(s.named('syncTerminated')).toStrictEqual([{ result: 'completed' }]);
	expect(s.saves()).toBe(1);
	expect(s.logs()).toContain('Local 2 item(s), remote 1 item(s), record 0 item(s).');

	// Nothing left to do: the next sync is a no-op and saves nothing.
	expect(await s.run()).toStrictEqual({ result: 'noop' });
	expect(s.named('syncTerminated').at(-1)).toStrictEqual({ result: 'noop' });
	expect(s.saves()).toBe(1);
});

test('files above the size limit are left out on both sides', async () => {
	const s = setup({
		local: { 'big.md': 'x'.repeat(20), 'small.md': 'x' },
		remote: { 'huge.md': 'y'.repeat(30) },
		settings: { maxFileSize: { enabled: true, value: 10 } },
	});
	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect([...s.remoteFs.files.keys()].toSorted()).toStrictEqual(['huge.md', 'small.md']);
	expect(s.localFs.files.has('huge.md')).toBe(false);
});

test('exclusion rules keep matching files out of the sync', async () => {
	const s = setup({ local: { 'a.md': 'A', 'secret/b.md': 'B' } });
	const options: SyncOptions = {
		exclusionRules: [{ caseSensitive: false, expr: 'secret' }],
	};
	expect(await s.run('manual', options)).toStrictEqual({ result: 'completed' });
	expect([...s.remoteFs.files.keys()]).toStrictEqual(['a.md']);
});

test('a moved file is moved on the other side instead of copied again', async () => {
	const s = setup({ synced: { 'old.md': 'text' } });
	s.localFs.rename('old.md', 'new.md');

	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect([...s.remoteFs.files.keys()]).toStrictEqual(['new.md']);
	expect(s.logs()).toContain('Discovered and converted 1 move task(s).');

	// Without move detection the same change is an upload and a deletion.
	const plain = setup({ synced: { 'old.md': 'text' } });
	plain.localFs.rename('old.md', 'new.md');
	await plain.run('manual', { detectMoves: false });
	expect(keys(plain.named('executionStarted')[0])).toStrictEqual([
		'removeRemote old.md',
		'upload new.md',
	]);
});

test('reviewing the tasks runs only the approved ones', async () => {
	const s = setup({ local: { 'a.md': 'A' }, remote: { 'b.md': 'B' } });
	s.on('requestConfirmTasks', (tasks: Array<BaseTask>) =>
		s.dispatch(
			'tasksConfirmed',
			tasks.filter((task) => task.key === 'a.md'),
		),
	);

	expect(await s.run('manual', { needConfirmTasks: true })).toStrictEqual({
		result: 'completed',
	});
	expect(keys(s.named('requestConfirmTasks')[0])).toStrictEqual(['upload a.md', 'download b.md']);
	expect(s.remoteFs.text('a.md')).toBe('A');
	expect(s.localFs.files.has('b.md')).toBe(false);
});

test('rejecting every reviewed task ends as a no-op', async () => {
	const s = setup({ local: { 'a.md': 'A' } });
	s.on('requestConfirmTasks', () => s.dispatch('tasksConfirmed', []));
	expect(await s.run('manual', { needConfirmTasks: true })).toStrictEqual({ result: 'noop' });
	expect(s.remoteFs.files.size).toBe(0);
});

test('a reviewed list does not ask again about mass deletion or deletions', async () => {
	const s = setup({ synced: many(51) });
	for (const key of Object.keys(many(51))) s.localFs.remove(key);
	s.on('requestConfirmTasks', (tasks: Array<BaseTask>) => s.dispatch('tasksConfirmed', tasks));

	const result = await s.run('manual', { needConfirmDeletion: true, needConfirmTasks: true });
	expect(result).toStrictEqual({ result: 'completed' });
	expect(s.named('requestConfirmMassDelete')).toStrictEqual([]);
	expect(s.named('requestConfirmDelete')).toStrictEqual([]);
	expect(s.remoteFs.files.size).toBe(0);
});

test('a mass deletion asks first, and declining keeps every file', async () => {
	const s = setup({ synced: { ...many(51), 'kept.md': 'k' } });
	for (const key of Object.keys(many(51))) s.localFs.remove(key);
	s.on('requestConfirmMassDelete', () => s.dispatch('massDeleteConfirmed', false));

	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.named('requestConfirmMassDelete')).toStrictEqual([{ local: 0, remote: 51 }]);
	// Deleted in the vault, kept on Drive: downloaded back.
	expect(s.localFs.files.size).toBe(52);
	expect(s.remoteFs.files.size).toBe(52);
	expect(s.localFs.text('n7.md')).toBe('text 7');
	expect(s.logs()).toContain('0 local and 51 remote deletion(s) exceed the limit of 50; asking.');
});

test('a mass deletion that is approved goes ahead', async () => {
	const s = setup({ synced: many(51) });
	for (const key of Object.keys(many(51))) s.remoteFs.remove(key);
	s.on('requestConfirmMassDelete', () => s.dispatch('massDeleteConfirmed', true));

	// Approving the mass deletion also approves each deletion.
	expect(await s.run('manual', { needConfirmDeletion: true })).toStrictEqual({
		result: 'completed',
	});
	expect(s.named('requestConfirmMassDelete')).toStrictEqual([{ local: 51, remote: 0 }]);
	expect(s.named('requestConfirmDelete')).toStrictEqual([]);
	expect(s.localFs.files.size).toBe(0);
	expect(s.records.size).toBe(0);
});

test('a mass change asks first, and declining stops the sync untouched', async () => {
	const s = setup({ synced: many(101) });
	for (const key of Object.keys(many(101))) s.localFs.put(key, 'rewritten');
	s.on('requestConfirmMassChange', () => s.dispatch('massChangeConfirmed', false));

	const result = await s.run();
	expect(s.named('requestConfirmMassChange')).toStrictEqual([{ changes: 101, percent: 100 }]);
	// Stopping is the user's choice: cancelled, not failed (#141).
	expect(result).toStrictEqual({ result: 'cancelled' });
	expect(s.named('syncTerminated')).toStrictEqual([result]);
	expect(s.named('executionStarted')).toStrictEqual([]);
	expect(s.remoteFs.text('n0.md')).toBe('text 0');
});

test('an approved mass change goes ahead', async () => {
	const s = setup({ synced: many(101) });
	for (const key of Object.keys(many(101))) s.localFs.put(key, 'rewritten');
	s.on('requestConfirmMassChange', () => s.dispatch('massChangeConfirmed', true));

	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.remoteFs.text('n100.md')).toBe('rewritten');
	expect(s.logs()).toContain('101 change(s) to synced files (100%) exceed the limit; asking.');
});

test('confirming local deletions deletes some and uploads the others again', async () => {
	const s = setup({
		synced: { 'back.md': 'B', 'dir/': '', 'gone.md': 'G', 'missing.md': 'M', 'stay.md': 'S' },
	});
	for (const key of ['back.md', 'dir/', 'gone.md', 'missing.md']) s.remoteFs.remove(key);
	s.on('requestConfirmDelete', (tasks: Array<RemoveLocal>) => {
		// Deleted from the vault too while the user was deciding.
		s.localFs.remove('missing.md');
		s.dispatch('deleteConfirmed', {
			delete: tasks.filter((task) => task.key === 'gone.md'),
			reupload: tasks.filter((task) => task.key !== 'gone.md'),
		});
	});

	expect(await s.run('manual', { needConfirmDeletion: true })).toStrictEqual({
		result: 'completed',
	});
	expect(keys(s.named('requestConfirmDelete')[0]).toSorted()).toStrictEqual([
		'removeLocal back.md',
		'removeLocal dir/',
		'removeLocal gone.md',
		'removeLocal missing.md',
	]);
	expect(s.localFs.files.has('gone.md')).toBe(false);
	expect(s.records.has('gone.md')).toBe(false);
	expect(s.remoteFs.text('back.md')).toBe('B');
	expect(s.remoteFs.folders.has('dir/')).toBe(true);
	expect(s.records.get('dir/')).toStrictEqual({ isDir: true });
	expect(s.remoteFs.files.has('missing.md')).toBe(false);
	expect(s.logs()).toContain('Local file `missing.md` not found during reupload.');
});

test('without asking, deletions on Drive delete the vault copies', async () => {
	const s = setup({ synced: { 'gone.md': 'G' } });
	s.remoteFs.remove('gone.md');
	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.named('requestConfirmDelete')).toStrictEqual([]);
	expect(s.localFs.files.size).toBe(0);
});

test('with never delete on Drive, vault deletions only forget the record', async () => {
	const s = setup({
		settings: { keptOnRemote: { 'stale.md': 'old' }, neverDeleteRemote: true },
		synced: { 'a.md': 'A', 'b.md': 'B' },
	});
	s.localFs.remove('a.md');

	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.remoteFs.text('a.md')).toBe('A');
	expect(s.records.has('a.md')).toBe(false);
	// The stale mark (gone from Drive) is dropped, the new one is kept.
	expect(s.settings.keptOnRemote).toStrictEqual({ 'a.md': uidOf(s.remoteFs, 'a.md') });
	expect(s.logs()).toContain('Kept 1 file(s) on Drive instead of deleting them.');
	// Dropping the stale mark, keeping the file, and the end of the run each save.
	expect(s.saves()).toBe(3);

	// The kept file is hidden from later syncs: not downloaded back.
	expect(await s.run()).toStrictEqual({ result: 'noop' });
	expect(s.localFs.files.has('a.md')).toBe(false);
});

test('syncing one file leaves every other file and record alone', async () => {
	const s = setup({
		local: { 'dir/b.md': 'B', 'other.md': 'O' },
		synced: { 'kept.md': 'K' },
	});
	s.remoteFs.remove('kept.md');

	expect(await s.run('file', { only: 'dir/b.md' })).toStrictEqual({ result: 'completed' });
	expect([...s.remoteFs.files.keys()]).toStrictEqual(['dir/b.md']);
	expect(s.remoteFs.folders.has('dir/')).toBe(true);
	expect(s.localFs.files.has('kept.md')).toBe(true);
	expect(s.records.has('kept.md')).toBe(true);
});

test('a failing task fails the sync, and after three failures in a row it is skipped', async () => {
	const s = setup({ local: { 'bad.md': 'x', 'good.md': 'y' } });
	s.remoteFs.onWrite.set('bad.md', () => {
		throw new Error('Drive said no');
	});

	const failed = { error: 'Execution of 1 sync task(s) failed.', result: 'failed' } as const;
	expect(await s.run()).toStrictEqual(failed);
	expect(s.named('taskFailed')).toStrictEqual([
		{
			error: 'Drive said no',
			isDir: false,
			key: 'bad.md',
			name: 'upload',
			prettyName: 'upload',
		},
	]);
	expect(s.remoteFs.text('good.md')).toBe('y');
	expect(s.settings.skipState).toStrictEqual({ failures: { 'bad.md': 1 }, skipped: [] });

	expect(await s.run()).toStrictEqual(failed);
	expect(notices).toStrictEqual([]);
	expect(await s.run()).toStrictEqual(failed);
	expect(s.settings.skipState).toStrictEqual({ failures: {}, skipped: ['bad.md'] });
	expect(notices).toStrictEqual(['fileSkipped bad.md']);
	expect(s.logs()).toContain('Moved `bad.md` to the skip list.');

	// Skipped files are left out; with nothing else to do, the sync is a no-op.
	expect(await s.run()).toStrictEqual({ result: 'noop' });
	expect(s.logs()).toContain('Skipping 1 file(s) on the skip list.');

	// The retry command clears the list, so the next sync tries the file again.
	s.sync.start();
	const retry = s.commands.find((command) => command.id === 'retry-skipped-files');
	expect(retry?.name).toBe('retrySkippedFiles');
	const saves = s.saves();
	retry?.callback?.();
	expect(s.settings.skipState).toStrictEqual({ failures: {}, skipped: [] });
	expect(s.saves()).toBe(saves + 1);
	expect(notices).toContain('skippedFilesCleared');
	s.remoteFs.onWrite.delete('bad.md');
	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.remoteFs.text('bad.md')).toBe('x');
});

test('a success resets the failure count of a file', async () => {
	const s = setup({ local: { 'flaky.md': 'x' } });
	s.remoteFs.onWrite.set('flaky.md', () => {
		throw new Error('timeout');
	});
	await s.run();
	s.remoteFs.onWrite.delete('flaky.md');
	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.settings.skipState).toStrictEqual({ failures: {}, skipped: [] });
});

test('cancelling during execution ends as cancelled and hides the failures it causes', async () => {
	const s = setup({ local: { 'fast.md': 'f', 'slow.md': 's' } });
	const gate = deferred<void>();
	s.remoteFs.onWrite.set('slow.md', () => gate.promise);
	s.on('executionStarted', () => s.dispatch('syncCanceled'));

	const running = s.run();
	await flush(20);
	gate.reject(new Error('aborted'));

	expect(await running).toStrictEqual({ result: 'cancelled' });
	expect(s.named('taskFailed')).toStrictEqual([]);
	expect(s.named('syncTerminated')).toStrictEqual([{ result: 'cancelled' }]);
	expect(s.settings.skipState.failures).toStrictEqual({});
});

test('cancelling while a question is open ends as cancelled', async () => {
	const s = setup({ local: { 'a.md': 'A' } });
	s.on('requestConfirmTasks', () => s.dispatch('syncCanceled'));

	expect(await s.run('manual', { needConfirmTasks: true })).toStrictEqual({
		result: 'cancelled',
	});
	expect(s.remoteFs.files.size).toBe(0);
	// The answer listener was removed: a late answer changes nothing.
	s.dispatch('tasksConfirmed', []);
	expect(s.named('syncTerminated')).toHaveLength(1);
});

test('cancelling right at the start or during listing ends as cancelled', async () => {
	const atStart = setup({ local: { 'a.md': 'A' } });
	atStart.on('syncStarted', () => atStart.dispatch('syncCanceled'));
	expect(await atStart.run()).toStrictEqual({ result: 'cancelled' });
	expect(atStart.named('syncInitialized')).toStrictEqual([]);

	const whileListing = setup({ local: { 'a.md': 'A' } });
	const lister = () => {
		whileListing.dispatch('syncCanceled');
		return [];
	};
	expect(await whileListing.run('manual', { remoteLister: lister })).toStrictEqual({
		result: 'cancelled',
	});
	expect(whileListing.remoteFs.files.size).toBe(0);
});

test('a listing error fails the sync with its message', async () => {
	const s = setup({ local: { 'a.md': 'A' } });
	s.remoteFs.fs.list = () => {
		throw new Error('Drive unreachable');
	};
	expect(await s.run()).toStrictEqual({ error: 'Drive unreachable', result: 'failed' });
	expect(s.named('syncTerminated')).toStrictEqual([
		{ error: 'Drive unreachable', result: 'failed' },
	]);
});

test('a deleted Drive root is created again and the records cleared', async () => {
	const s = setup({ synced: { 'a.md': 'A' } });
	s.remoteFs.fs.list = () => {
		throw new Error('404');
	};
	s.remoteFs.fs.exists = () => false;

	expect(await s.run()).toStrictEqual({ result: 'completed' });
	expect(s.logs()).toContain('Remote root deleted, recreating.');
	// With no records left, the vault copy is uploaded instead of deleted.
	expect(s.localFs.text('a.md')).toBe('A');
	expect(s.records.get('a.md')).toMatchObject({
		isDir: false,
		local: uidOf(s.localFs, 'a.md'),
	});
});

test('the remote listing reports its progress', async () => {
	const s = setup({ local: { 'a.md': 'A' } });
	await s.run('manual', {
		remoteLister: ({ reporter }) => {
			void reporter({ completed: 1, current: 'b.md', total: 2 });
			return [];
		},
	});
	expect(s.named('remoteWalkProgress')).toStrictEqual([
		{ completed: 1, current: 'b.md', total: 2 },
	]);
});

test('an explicit decider and conflict resolver replace the configured ones', async () => {
	const s = setup({ local: { 'a.md': 'local' }, remote: { 'a.md': 'remote!' } });
	const used: Array<string> = [];
	const result = await s.run('manual', {
		conflictResolver: ({ key }) => void used.push(key),
		decider: (input) => {
			used.push('decider');
			return bidirectionalDecider(input);
		},
	});
	expect(result).toStrictEqual({ result: 'completed' });
	expect(used).toStrictEqual(['decider', 'a.md']);
});

test('sync this file runs a one-file sync for the active note', async () => {
	const s = setup({ local: { 'note.md': 'N', 'other.md': 'O' } });
	s.sync.start();
	const command = s.commands.find((item) => item.id === 'sync-this-file');
	expect(command?.name).toBe('syncThisFile');

	// No active note: nothing to offer.
	expect(command?.checkCallback?.(true)).toBe(false);

	s.workspace.activeFile = Object.assign(new TFile(), { path: 'note.md' });
	expect(command?.checkCallback?.(true)).toBe(true);
	expect(s.named('syncStarted')).toStrictEqual([]);
	command?.checkCallback?.(false);
	await flush(40);

	expect(s.named('syncStarted')).toMatchObject([{ trigger: 'file' }]);
	expect([...s.remoteFs.files.keys()]).toStrictEqual(['note.md']);
	expect(notices).toContain('fileSynced note.md');
});
