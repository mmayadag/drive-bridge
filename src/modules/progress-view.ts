import type { Translations } from '@';
import type { BaseTask } from '@/sync';
import type { Progress } from '@/types';
import roundPercent from '@/utils/round-percent';
import type { Translate } from './i18n';
import type { SyncStage } from './observability';
import type { TaskInfo } from './sync';

export type ProgressView = {
	completed?: number;
	total?: number;
	percent?: number;
	current?: string;
	/** False hides the count and the bar. */
	counter?: boolean;
};

/** What the progress row shows for a sync stage. */
export function describeProgress(
	stage: SyncStage,
	walkProgress: () => Progress,
	executionProgress: () => Progress<TaskInfo>,
	t: Translate<Translations>,
): ProgressView {
	if (stage === 'walkingRemote') {
		const { completed, current, total } = walkProgress();
		return {
			completed,
			current: current ? `${t('walkingRemote')} ${current}` : t('walkingRemote'),
			percent: roundPercent(completed, total),
			total,
		};
	} else if (stage === 'executing') {
		const { completed, current, total } = executionProgress();
		return {
			completed,
			current: current ? `${t(current.name)} ${current.key}` : t('executing'),
			percent: roundPercent(completed, total),
			total,
		};
	} else if (stage === 'awaitingConfirmation')
		// Nothing has run yet; the operation count is in the text below.
		return { counter: false, current: t('awaitingConfirmation') };
	else if (stage === 'none') return {};
	else if (stage === 'cancelled') return { current: t('cancelled') };
	else if (stage === 'completed') return { current: t('completed') };
	else if (stage === 'completedNoop')
		return {
			completed: 0,
			current: t('completedNoop'),
			percent: 100,
			total: 0,
		};
	return { current: t('failed') };
}

export type TaskCounts = {
	total: number;
	deleteLocal: number;
	deleteRemote: number;
	conflict: number;
};

/** How many tasks there are, and how many delete or resolve a conflict. */
export function countTasks(tasks: Array<BaseTask>): TaskCounts {
	const counts: TaskCounts = {
		conflict: 0,
		deleteLocal: 0,
		deleteRemote: 0,
		total: tasks.length,
	};
	for (const { name } of tasks)
		if (name === 'removeLocal') counts.deleteLocal++;
		else if (name === 'removeRemote') counts.deleteRemote++;
		else if (name === 'resolveConflict') counts.conflict++;
	return counts;
}
