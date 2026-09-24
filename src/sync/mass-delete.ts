import type { BaseTask, TaskFactory } from './index';
import Download from './tasks/download';
import RemoveLocal from './tasks/remove-local';
import RemoveRemote from './tasks/remove-remote';
import ResolveConflict from './tasks/resolve-conflict';
import Upload from './tasks/upload';

/** Deletions above max(50, 5% of the files) in one sync need the user's approval. */
export const MASS_DELETE_MIN = 50;
export const MASS_DELETE_RATIO = 0.05;

export function massDeleteThreshold(fileCount: number) {
	return Math.max(MASS_DELETE_MIN, Math.ceil(fileCount * MASS_DELETE_RATIO));
}

export type MassDeletion = {
	local: Array<RemoveLocal>;
	remote: Array<RemoveRemote>;
	threshold: number;
	exceeded: boolean;
};

/** The planned deletions on each side, and whether together they pass the threshold. */
export function findMassDeletion(tasks: Array<BaseTask>, fileCount: number): MassDeletion {
	const local = tasks.filter((task): task is RemoveLocal => task instanceof RemoveLocal);
	const remote = tasks.filter((task): task is RemoveRemote => task instanceof RemoveRemote);
	const threshold = massDeleteThreshold(fileCount);
	return { exceeded: local.length + remote.length > threshold, local, remote, threshold };
}

/**
 * Replaces the deletions with the opposite copy, so both sides end up with the file again
 * and the next sync does not plan the same deletions: files deleted in the vault come back
 * from Drive, files deleted on Drive are uploaded again from the vault.
 */
export function keepDeletedFiles(
	tasks: Array<BaseTask>,
	{ local, remote }: MassDeletion,
	taskFactory: TaskFactory,
): Array<BaseTask> {
	const removals = new Set<BaseTask>([...local, ...remote]);
	const restored: Array<BaseTask> = [];
	// A vault deletion means Drive still has the file: download it back.
	for (const task of remote) {
		const { remote: stat, local: _local, ...options } = task.options;
		restored.push(
			stat.isDir
				? taskFactory('createLocalDir', { ...options, remote: stat })
				: taskFactory('download', { ...options, remote: stat }),
		);
	}
	// A Drive deletion means the vault still has the file: upload it again.
	for (const task of local) {
		const { local: stat, remote: _remote, ...options } = task.options;
		restored.push(
			stat.isDir
				? taskFactory('createRemoteDir', { ...options, local: stat })
				: taskFactory('upload', { ...options, local: stat }),
		);
	}
	return [...tasks.filter((task) => !removals.has(task)), ...restored];
}

/** Changes to already synced files above max(100, half of the files) need approval. */
export const MASS_CHANGE_MIN = 100;
export const MASS_CHANGE_RATIO = 0.5;

/**
 * Uploads, downloads and conflicts of files that were synced before. A first sync, which
 * copies everything, has no records and never trips this.
 */
export function findMassChange(
	tasks: Array<BaseTask>,
	synced: ReadonlySet<string>,
	fileCount: number,
) {
	const changes = tasks.filter(
		(task) =>
			synced.has(task.key) &&
			(task instanceof Upload || task instanceof Download || task instanceof ResolveConflict),
	).length;
	const threshold = Math.max(MASS_CHANGE_MIN, Math.ceil(fileCount * MASS_CHANGE_RATIO));
	return {
		changes,
		exceeded: changes > threshold,
		percent: fileCount ? Math.round((changes / fileCount) * 100) : 0,
		threshold,
	};
}
