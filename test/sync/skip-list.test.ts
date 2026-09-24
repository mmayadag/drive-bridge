import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames, TaskOptions } from '@/sync';
import type { SkipState } from '@/sync/skip-list';
import { taskMap } from '@/sync';
import { SKIP_AFTER, countOutcome, withoutSkipped } from '@/sync/skip-list';

const { file } = testKit;

const task = (name: TaskNames, key: string) => {
	const created = new taskMap[name]({
		key,
		local: file(key),
		localFs: {} as never,
		record: {} as never,
		remote: file(key),
		remoteFs: {} as never,
	} as TaskOptions as never);
	created.name = name;
	return created as BaseTask;
};

test(`a file is skipped after ${SKIP_AFTER} failures in a row`, () => {
	const state: SkipState = { failures: {}, skipped: [] };
	expect(countOutcome(state, 'bad.md', false)).toBe(false);
	expect(countOutcome(state, 'bad.md', false)).toBe(false);
	expect(countOutcome(state, 'bad.md', false)).toBe(true);
	expect(state).toStrictEqual({ failures: {}, skipped: ['bad.md'] });
});

test('a success in between resets the count', () => {
	const state: SkipState = { failures: {}, skipped: [] };
	countOutcome(state, 'flaky.md', false);
	countOutcome(state, 'flaky.md', false);
	countOutcome(state, 'flaky.md', true);
	expect(countOutcome(state, 'flaky.md', false)).toBe(false);
	expect(state.skipped).toStrictEqual([]);
});

test('tasks of skipped files are left out and counted once per file', () => {
	const tasks = [
		task('upload', 'bad.md'),
		task('upload', 'ok.md'),
		task('removeRecord', 'bad.md'),
	];
	const { run, skippedCount } = withoutSkipped(tasks, ['bad.md']);
	expect(run.map((item) => item.key)).toStrictEqual(['ok.md']);
	expect(skippedCount).toBe(1);
});
