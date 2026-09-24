import type { StatsMap } from '@/types';
import type { BaseTask, TaskFactory } from './index';
import RemoveRemote from './tasks/remove-remote';

/**
 * Files deleted in the vault but kept on Drive, by key, with the Drive version that was
 * kept (a file's uid, or '' for a folder). Device-local.
 */
export type KeptOnRemote = Record<string, string>;

const version = (stat: { isDir: boolean; uid?: string }) => (stat.isDir ? '' : (stat.uid ?? ''));

/**
 * Hides kept files from the remote listing, so they are neither deleted nor downloaded
 * again. A mark is dropped when the file is gone from Drive, back in the vault, or changed
 * on Drive since it was kept (a new version is worth syncing). Returns whether any mark
 * was dropped.
 */
export function hideKeptOnRemote(
	kept: KeptOnRemote,
	localStats: StatsMap,
	remoteStats: StatsMap,
): boolean {
	let changed = false;
	for (const [key, keptVersion] of Object.entries(kept)) {
		const remote = remoteStats.get(key);
		if (remote && !localStats.has(key) && version(remote) === keptVersion) {
			remoteStats.delete(key);
			continue;
		}
		delete kept[key];
		changed = true;
	}
	return changed;
}

/**
 * Replaces every Drive deletion with forgetting the record, and marks the file as kept.
 * Returns the new task list.
 */
export function keepOnRemote(
	tasks: Array<BaseTask>,
	kept: KeptOnRemote,
	taskFactory: TaskFactory,
): Array<BaseTask> {
	return tasks.map((task) => {
		if (!(task instanceof RemoveRemote)) return task;
		kept[task.key] = version(task.options.remote);
		const { local: _local, remote: _remote, ...options } = task.options;
		return taskFactory('removeRecord', options);
	});
}
