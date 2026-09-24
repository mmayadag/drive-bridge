import type { BaseTask } from './index';

/** A file whose task fails this many syncs in a row is skipped until retried. */
export const SKIP_AFTER = 3;

/** Device-local: failures in a row per key, and the keys being skipped. */
export type SkipState = { failures: Record<string, number>; skipped: Array<string> };

/** Counts a task's outcome; returns true when this failure puts the file on the skip list. */
export function countOutcome(state: SkipState, key: string, succeeded: boolean): boolean {
	if (succeeded) {
		delete state.failures[key];
		return false;
	}
	const failures = (state.failures[key] ?? 0) + 1;
	state.failures[key] = failures;
	if (failures < SKIP_AFTER || state.skipped.includes(key)) return false;
	state.skipped.push(key);
	delete state.failures[key];
	return true;
}

/** Leaves out the tasks of skipped files. */
export function withoutSkipped(tasks: Array<BaseTask>, skipped: Array<string>) {
	if (!skipped.length) return { run: tasks, skippedCount: 0 };
	const set = new Set(skipped);
	const run = tasks.filter((task) => !set.has(task.key));
	return {
		run,
		skippedCount: new Set(tasks.filter((task) => set.has(task.key)).map((task) => task.key))
			.size,
	};
}
