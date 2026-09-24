/** Summaries of recent syncs on this device, newest first. No file names. */
export const HISTORY_SIZE = 30;

export type SyncCounts = {
	uploaded: number;
	downloaded: number;
	deletedHere: number;
	deletedOnDrive: number;
	conflicts: number;
	failed: number;
};

export type SyncSummary = {
	at: number;
	trigger: string;
	result: 'completed' | 'noop' | 'cancelled' | 'failed';
	error?: string;
	counts: SyncCounts;
};

export const emptyCounts = (): SyncCounts => ({
	conflicts: 0,
	deletedHere: 0,
	deletedOnDrive: 0,
	downloaded: 0,
	failed: 0,
	uploaded: 0,
});

const COUNTED: Record<string, keyof SyncCounts> = {
	download: 'downloaded',
	removeLocal: 'deletedHere',
	removeRemote: 'deletedOnDrive',
	resolveConflict: 'conflicts',
	upload: 'uploaded',
};

/** Counts planned tasks by what they do; moves, folders and record tasks are not counted. */
export function countTasks(names: Array<string>): SyncCounts {
	const counts = emptyCounts();
	for (const name of names) {
		const key = COUNTED[name];
		if (key) counts[key]++;
	}
	return counts;
}

/** Adds a summary to the front and keeps the newest HISTORY_SIZE. */
export function addToHistory(history: Array<SyncSummary>, summary: SyncSummary) {
	history.unshift(summary);
	history.splice(HISTORY_SIZE);
}
