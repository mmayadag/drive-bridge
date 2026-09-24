import type { Translations } from '@';
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
