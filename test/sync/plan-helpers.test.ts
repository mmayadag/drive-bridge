import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';
import { prepareReporter, sortTasks } from '@/sync/plan-helpers';

const task = (name: TaskNames, key: string, isDir = false) =>
	({ key, local: { isDir }, name }) as unknown as BaseTask;

test('file deletions first, then folders deepest-last to create, moves, the rest, folder removals deepest-first', () => {
	const tasks = [
		task('upload', 'u.md'),
		task('removeRemote', 'gone/', true),
		task('removeRemote', 'gone/deeper/', true),
		task('moveLocal', 'a/b/moved.md'),
		task('moveLocal', 'moved.md'),
		task('createLocalDir', 'new/inner/', true),
		task('createRemoteDir', 'new/', true),
		task('removeLocal', 'file.md'),
	];
	sortTasks(tasks);
	expect(tasks.map(({ key, name }) => `${name} ${key}`)).toStrictEqual([
		'removeLocal file.md',
		'createRemoteDir new/',
		'createLocalDir new/inner/',
		'moveLocal moved.md',
		'moveLocal a/b/moved.md',
		'removeRemote gone/deeper/',
		'removeRemote gone/',
		'upload u.md',
	]);
});

test('the reporter follows the rules and walks into probe folders', () => {
	const verdicts: Record<string, 'include' | 'exclude' | 'probe'> = {
		'empty-probe/': 'probe',
		'maybe/': 'probe',
		'notes/': 'include',
		'private/': 'exclude',
	};
	const { pruner, reporter } = prepareReporter((path) => verdicts[path] ?? 'include');
	const progress = (current: string) => ({ completed: 0, current, total: 0 });
	expect(reporter(progress('notes/'))).toBe('include');
	expect(reporter(progress('private/'))).toBe('exclude');
	expect(reporter(progress('maybe/'))).toBe('advance');
	expect(reporter(progress('empty-probe/'))).toBe('advance');

	const stat = (key: string) => ({ isDir: key.endsWith('/'), key }) as never;
	// A probe folder stays only when something inside it was kept.
	expect(
		pruner([stat('maybe/'), stat('maybe/kept.md'), stat('empty-probe/'), stat('notes/')]).map(
			({ key }: { key: string }) => key,
		),
	).toStrictEqual(['maybe/', 'maybe/kept.md', 'notes/']);
	// Nothing but probes: nothing at all.
	expect(pruner([stat('maybe/'), stat('empty-probe/')])).toStrictEqual([]);
});
