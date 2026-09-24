import { expect, test } from 'bun:test';
import type { SyncSummary } from '@/sync/history';
import { addToHistory, countTasks, emptyCounts, HISTORY_SIZE } from '@/sync/history';

test('counts what the tasks do', () => {
	expect(
		countTasks([
			'upload',
			'upload',
			'download',
			'removeLocal',
			'removeRemote',
			'resolveConflict',
			'addRecord',
			'createLocalDir',
		]),
	).toStrictEqual({
		conflicts: 1,
		deletedHere: 1,
		deletedOnDrive: 1,
		downloaded: 1,
		failed: 0,
		uploaded: 2,
	});
});

test('keeps the newest summaries first, up to the limit', () => {
	const history: Array<SyncSummary> = [];
	for (let at = 0; at < HISTORY_SIZE + 5; at++)
		addToHistory(history, { at, counts: emptyCounts(), result: 'noop', trigger: 'interval' });
	expect(history).toHaveLength(HISTORY_SIZE);
	expect(history[0]?.at).toBe(HISTORY_SIZE + 4);
	expect(history.at(-1)?.at).toBe(5);
});
