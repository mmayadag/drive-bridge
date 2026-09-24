import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { BaseTask, TaskFactory, TaskNames, TaskOptions } from '@/sync';
import { taskMap } from '@/sync';
import {
	findMassChange,
	findMassDeletion,
	keepDeletedFiles,
	massDeleteThreshold,
} from '@/sync/mass-delete';

const { file, folder } = testKit;

const taskFactory = ((name: TaskNames, options: TaskOptions) => {
	const task = new taskMap[name]({
		...options,
		localFs: {} as never,
		record: {} as never,
		remoteFs: {} as never,
	} as never);
	task.name = name;
	return task;
}) as TaskFactory;

const removeRemote = (key: string) => taskFactory('removeRemote', { key, remote: file(key) });
const removeLocal = (key: string) => taskFactory('removeLocal', { key, local: file(key) });

test('the threshold is 50 files or 5% of the vault, whichever is larger', () => {
	expect(massDeleteThreshold(0)).toBe(50);
	expect(massDeleteThreshold(1000)).toBe(50);
	expect(massDeleteThreshold(2000)).toBe(100);
	expect(massDeleteThreshold(2001)).toBe(101);
});

test('counts deletions on both sides together', () => {
	const tasks: Array<BaseTask> = [
		...Array.from({ length: 30 }, (_, i) => removeRemote(`r${i}.md`)),
		...Array.from({ length: 21 }, (_, i) => removeLocal(`l${i}.md`)),
		taskFactory('upload', { key: 'new.md', local: file('new.md') }),
	];
	const found = findMassDeletion(tasks, 400);
	expect([found.remote.length, found.local.length, found.exceeded]).toStrictEqual([30, 21, true]);
	expect(findMassDeletion(tasks.slice(1), 400).exceeded).toBe(false);
});

test('keeping the files copies each one back instead of deleting it', () => {
	const upload = taskFactory('upload', { key: 'new.md', local: file('new.md') });
	const tasks: Array<BaseTask> = [
		removeRemote('gone-here.md'),
		taskFactory('removeRemote', { key: 'dir/', remote: folder('dir/') }),
		removeLocal('gone-there.md'),
		upload,
	];
	const kept = keepDeletedFiles(tasks, findMassDeletion(tasks, 0), taskFactory);
	expect(kept.map((task) => `${task.name} ${task.key}`)).toStrictEqual([
		'upload new.md',
		'download gone-here.md',
		'createLocalDir dir/',
		'upload gone-there.md',
	]);
});

test('mass changes count only files that were synced before', () => {
	const synced = new Set(Array.from({ length: 150 }, (_, i) => `n${i}.md`));
	const uploads = Array.from({ length: 120 }, (_, i) =>
		taskFactory('upload', { key: `n${i}.md`, local: file(`n${i}.md`) }),
	);
	const found = findMassChange(uploads, synced, 200);
	expect(found).toStrictEqual({ changes: 120, exceeded: true, percent: 60, threshold: 100 });
	// A first sync uploads everything but has no records.
	expect(findMassChange(uploads, new Set(), 200).exceeded).toBe(false);
	// Below half of a big vault is normal.
	expect(findMassChange(uploads, synced, 1000).exceeded).toBe(false);
});
