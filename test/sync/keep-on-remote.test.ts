import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { BaseTask, TaskFactory, TaskNames, TaskOptions } from '@/sync';
import type { KeptOnRemote } from '@/sync/keep-on-remote';
import type { Stat } from '@/types';
import { bidirectionalDecider, taskMap } from '@/sync';
import { hideKeptOnRemote, keepOnRemote } from '@/sync/keep-on-remote';

const { file, folder, runDecider } = testKit;

const taskFactory = ((name: TaskNames, options: TaskOptions) => {
	const task = new taskMap[name]({
		...options,
		localFs: {} as never,
		record: {} as never,
		remoteFs: {} as never,
	} as never);
	return task;
}) as TaskFactory;

const names = (tasks: Array<BaseTask>) => tasks.map((task) => `${task.name} ${task.key}`);

test('Drive deletions become forgetting the record, and the file is marked kept', () => {
	const kept: KeptOnRemote = {};
	const tasks = keepOnRemote(
		[
			taskFactory('removeRemote', { key: 'a.md', remote: file('a.md', { uid: 'r1' }) }),
			taskFactory('removeRemote', { key: 'dir/', remote: folder('dir/') }),
			taskFactory('upload', { key: 'b.md', local: file('b.md') }),
		],
		kept,
		taskFactory,
	);
	expect(names(tasks)).toStrictEqual(['removeRecord a.md', 'removeRecord dir/', 'upload b.md']);
	expect(kept).toStrictEqual({ 'a.md': 'r1', 'dir/': '' });
});

test('a kept file is neither deleted nor downloaded again', () => {
	const kept: KeptOnRemote = { 'a.md': 'r1' };
	const localStats = new Map<string, Stat>();
	const remoteStats = new Map<string, Stat>([['a.md', file('a.md', { uid: 'r1' })]]);
	expect(hideKeptOnRemote(kept, localStats, remoteStats)).toBe(false);
	expect(runDecider(bidirectionalDecider, { localStats, remoteStats })).toStrictEqual([]);
	expect(kept).toStrictEqual({ 'a.md': 'r1' });
});

test('the mark goes when the file changes on Drive, returns to the vault, or leaves Drive', () => {
	const kept: KeptOnRemote = { 'back.md': 'r3', 'changed.md': 'r1', 'gone.md': 'r2' };
	const localStats = new Map<string, Stat>([['back.md', file('back.md')]]);
	const remoteStats = new Map<string, Stat>([
		['changed.md', file('changed.md', { uid: 'r1-edited' })],
		['back.md', file('back.md', { uid: 'r3' })],
	]);
	expect(hideKeptOnRemote(kept, localStats, remoteStats)).toBe(true);
	expect(kept).toStrictEqual({});
	expect([...remoteStats.keys()]).toStrictEqual(['changed.md', 'back.md']);
	// The changed file downloads again.
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map(),
		records: new Map(),
		remoteStats: new Map([['changed.md', remoteStats.get('changed.md') as Stat]]),
	});
	expect(tasks.map((task) => task.name)).toStrictEqual(['download']);
});
