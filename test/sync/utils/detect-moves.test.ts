import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';
import type { RecordStatsMap, Stat } from '@/types';
import { convertMoves } from '@/sync';

function file(key: string, uid: string): Stat {
	return { isDir: false, key, mtime: 0, size: 0, uid };
}

function folder(key: string): Stat {
	return { isDir: true, key };
}

function makeTask(input: { name: TaskNames; key: string; local?: Stat; remote?: Stat }): BaseTask {
	const options = {
		key: input.key,
		local: input.local,
		localFs: {},
		record: {},
		remote: input.remote,
		remoteFs: {},
	};
	return {
		exec: () => {},
		key: input.key,
		local: input.local,
		name: input.name,
		options,
		prettyName: input.name,
		remote: input.remote,
	} as BaseTask;
}

function translate(name: TaskNames) {
	return `translated:${name}`;
}

function oldKey(task: BaseTask) {
	return (task.options as { oldKey?: string }).oldKey;
}

test('pairs file tasks using opposite-side record UIDs', () => {
	const tasks = [
		makeTask({ key: 'old.md', local: file('old.md', 'local-old'), name: 'removeLocal' }),
		makeTask({ key: 'new.md', name: 'download', remote: file('new.md', 'remote-new') }),
	];
	const records: RecordStatsMap = new Map([
		['old.md', { isDir: false, local: 'local-old', remote: 'remote-new' }],
	]);

	const [move] = convertMoves(tasks, translate, records);

	expect(move.name).toBe('moveLocal');
	expect(move.key).toBe('new.md');
	expect(oldKey(move)).toBe('old.md');
	expect(move.prettyName).toBe('translated:moveLocal');
});

test('keeps folder tasks when child basenames change', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({
			key: 'old/note.md',
			local: file('old/note.md', 'note-local'),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/renamed.md',
			name: 'download',
			remote: file('new/renamed.md', 'note-remote'),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => task.name)).toStrictEqual([
		'removeLocal',
		'createLocalDir',
		'moveLocal',
	]);
	expect(oldKey(result.find((task) => task.name === 'moveLocal') as BaseTask)).toBe(
		'old/note.md',
	);
});

test('collapses nested folders on the remote side while retaining child moves', () => {
	const tasks = [
		makeTask({ key: 'old/', name: 'removeRemote', remote: folder('old/') }),
		makeTask({ key: 'new/', local: folder('new/'), name: 'createRemoteDir' }),
		makeTask({ key: 'old/nested/', name: 'removeRemote', remote: folder('old/nested/') }),
		makeTask({ key: 'new/nested/', local: folder('new/nested/'), name: 'createRemoteDir' }),
		makeTask({
			key: 'old/nested/note.md',
			name: 'removeRemote',
			remote: file('old/nested/note.md', 'note-remote'),
		}),
		makeTask({
			key: 'new/nested/note.md',
			local: file('new/nested/note.md', 'note-local'),
			name: 'upload',
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/nested/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => [task.name, task.key, oldKey(task)])).toStrictEqual([
		['moveRemote', 'new/nested/note.md', 'old/nested/note.md'],
		['moveRemote', 'new/nested/', 'old/nested/'],
		['moveRemote', 'new/', 'old/'],
	]);
});

test('collapses nested folders while retaining child moves', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({ key: 'old/nested/', local: folder('old/nested/'), name: 'removeLocal' }),
		makeTask({ key: 'new/nested/', name: 'createLocalDir', remote: folder('new/nested/') }),
		makeTask({
			key: 'old/nested/note.md',
			local: file('old/nested/note.md', 'note-local'),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/nested/note.md',
			name: 'download',
			remote: file('new/nested/note.md', 'note-remote'),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/nested/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => [task.name, task.key, oldKey(task)])).toStrictEqual([
		['moveLocal', 'new/nested/note.md', 'old/nested/note.md'],
		['moveLocal', 'new/nested/', 'old/nested/'],
		['moveLocal', 'new/', 'old/'],
	]);
});

test('tasks that are neither a local nor a remote operation are left untouched', () => {
	const tasks = [
		makeTask({ key: 'note.md', name: 'resolveConflict' }),
		makeTask({ key: 'other.md', name: 'addRecord' }),
	];

	const result = convertMoves(tasks, translate, new Map());

	expect(result).toStrictEqual(tasks);
});

test('a task with an oldKey-like option but not a move name is not treated as a move', () => {
	// getMoveInfo is defensive: it only recognizes moveLocal/moveRemote by name, even if
	// something else happens to carry an `oldKey`-shaped option.
	const downloadTask = makeTask({
		key: 'note.md',
		name: 'download',
		remote: file('note.md', 'uid'),
	});
	Object.assign(downloadTask, { options: { key: 'note.md', oldKey: 'note-old.md' } });
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		downloadTask,
	];

	const result = convertMoves(tasks, translate, new Map());

	expect(result.map((task) => task.name)).toStrictEqual([
		'removeLocal',
		'createLocalDir',
		'download',
	]);
});

test('two unrelated folder renames in one sync each collapse, the deeper one first', () => {
	const tasks = [
		makeTask({ key: 'a/', local: folder('a/'), name: 'removeLocal' }),
		makeTask({ key: 'b/', name: 'createLocalDir', remote: folder('b/') }),
		makeTask({ key: 'deep/x/', local: folder('deep/x/'), name: 'removeLocal' }),
		makeTask({ key: 'deep/y/', name: 'createLocalDir', remote: folder('deep/y/') }),
		makeTask({ key: 'a/one.md', local: file('a/one.md', 'one-local'), name: 'removeLocal' }),
		makeTask({ key: 'b/one.md', name: 'download', remote: file('b/one.md', 'one-remote') }),
		makeTask({
			key: 'deep/x/two.md',
			local: file('deep/x/two.md', 'two-local'),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'deep/y/two.md',
			name: 'download',
			remote: file('deep/y/two.md', 'two-remote'),
		}),
	];
	const records: RecordStatsMap = new Map([
		['a/one.md', { isDir: false, local: 'one-local', remote: 'one-remote' }],
		['deep/x/two.md', { isDir: false, local: 'two-local', remote: 'two-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => [task.name, task.key, oldKey(task)])).toStrictEqual([
		['moveLocal', 'b/one.md', 'a/one.md'],
		['moveLocal', 'deep/y/two.md', 'deep/x/two.md'],
		['moveLocal', 'deep/y/', 'deep/x/'],
		['moveLocal', 'b/', 'a/'],
	]);
});
