import type { Progress, Stat } from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import { isSub } from '@/shared/path';
import type { BaseTask } from './index';

/** Deletions of files first, then folders created, moves, other tasks, and folder removals last. */
export function sortTasks(tasks: Array<BaseTask>) {
	const region = (task: BaseTask) => {
		const isFolder = task.local?.isDir === true || task.remote?.isDir === true;
		if (task.name === 'removeLocal' || task.name === 'removeRemote') return isFolder ? 3 : 0;
		if (task.name === 'createLocalDir' || task.name === 'createRemoteDir') return 1;
		return task.name === 'moveLocal' || task.name === 'moveRemote' ? 2 : 4;
	};
	tasks.sort((a, b) => {
		const aRegion = region(a);
		const bRegion = region(b);
		if (aRegion !== bRegion) return aRegion - bRegion;
		if (aRegion === 3) return b.key.length - a.key.length;
		if (aRegion === 1 || aRegion === 2) return a.key.length - b.key.length;
		return 0;
	});
}

export function prepareReporter(match: (path: string) => GlobMatchResult) {
	const probes: Array<string> = [];
	return {
		// Prune probe folders that need to be excluded
		pruner: (stats: Array<Stat>) => {
			const probeSet = new Set(probes);
			const content = stats.filter((p) => !probeSet.has(p.key));
			if (content.length === 0) return [];
			const keptProbes = new Set<string>();
			for (const probe of probeSet)
				if (content.some((p) => isSub(probe, p.key, false))) keptProbes.add(probe);
			return stats.filter((p) => !probeSet.has(p.key) || keptProbes.has(p.key));
		},
		reporter: (prog: Required<Progress>) => {
			const result = match(prog.current);
			if (result === 'probe') {
				probes.push(prog.current);
				return 'advance';
			}
			return result;
		},
	};
}
