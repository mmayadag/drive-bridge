import type { BaseTask } from './tasks/interface';
import CreateLocalDir from './tasks/create-local-dir';
import CreateRemoteDir from './tasks/create-remote-dir';
import Download from './tasks/download';
import Upload from './tasks/upload';

/**
 * The opposite of a planned task, for undoing it in the confirm dialog: keep the side it
 * would overwrite, or bring back what it would delete. Undefined when there is nothing on
 * the other side to keep, such as a new file.
 */
export default function reverseTask(task: BaseTask): BaseTask | undefined {
	const { local, name, options, remote } = task;
	// A pending upload: the Drive version comes back into the vault.
	if (name === 'upload' && remote && !remote.isDir) return new Download({ ...options, remote });
	// A pending download: the vault version goes back to Drive.
	if (name === 'download' && local && !local.isDir) return new Upload({ ...options, local });
	// Deleted on Drive: the vault copy is uploaded again.
	if (name === 'removeLocal' && local)
		return local.isDir
			? new CreateRemoteDir({ ...options, local })
			: new Upload({ ...options, local });
	// Deleted in the vault: the Drive copy is downloaded again.
	if (name === 'removeRemote' && remote)
		return remote.isDir
			? new CreateLocalDir({ ...options, remote })
			: new Download({ ...options, remote });
}

/** The opposite of each task, leaving out any that cannot be reversed. */
export function reverseTasks(tasks: Array<BaseTask>): Array<BaseTask> {
	return tasks.flatMap((task) => reverseTask(task) ?? []);
}
