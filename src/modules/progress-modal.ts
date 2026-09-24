import type { Events, Translations } from '@';
import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { Ref } from '@/shared/reactive';
import type { BaseTask, RemoveLocal, TaskNames } from '@/sync';
import type { Progress } from '@/types';
import ConfirmModal from '@/components/confirm-modal';
import mountFileTree from '@/components/file-tree';
import renderFailedTasks from '@/components/render-failed-tasks';
import renderProgress from '@/components/render-progress';
import { computed, hook } from '@/shared/reactive';
import roundPercent from '@/utils/round-percent';
import type { Dispatch, On } from './event-bus';
import type { Snippet, Translate } from './i18n';
import type { SyncStage } from './observability';
import type { FailedTaskInfo, TaskInfo } from './sync';

export type DeleteConfirmReturn = {
	delete: Array<RemoveLocal>;
	reupload: Array<RemoveLocal>;
};

type TaskCounts = {
	total: number;
	deleteLocal: number;
	deleteRemote: number;
	conflict: number;
};

export default class ProgressModal extends Modal {
	private readonly moduleCleanupCallbacks: Array<() => void> = [];
	private readonly t: Translate<Translations>;
	private opening = false;
	private readonly modalCleanupCallbacks = hook();
	private readonly dispatch: Dispatch<Events>;
	private description?: HTMLParagraphElement;
	private detailContainer?: HTMLDivElement;
	private controls?: HTMLElement;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<Translations>;
			on: On<Events>;
			dispatch: Dispatch<Events>;
			syncStage: Ref<SyncStage>;
			walkProgress: Ref<Progress>;
			executionProgress: Ref<Progress<TaskInfo>>;
		},
	) {
		super(ctx.app);
		this.t = ctx.translate;
		this.dispatch = ctx.dispatch;
		const failedTasks: Array<FailedTaskInfo> = [];
		this.moduleCleanupCallbacks.push(
			ctx.on('syncStarted', ({ trigger }) => {
				if (trigger === 'manual') this.open();
				this.renderHideStop();
			}),
			ctx.on('executionStarted', this.renderHideStop),
			ctx.on('taskFailed', (task) => failedTasks.push(task)),
			ctx.on('syncTerminated', () => {
				this.renderDone();
				if (!failedTasks.length) return;
				if (!this.opening) {
					this.open();
					this.renderDone();
				}
				this.description?.setText(this.t('failedTasksDescription', failedTasks.length));
				renderFailedTasks(this.detailContainer as HTMLDivElement, failedTasks);
				this.showDetails();
				failedTasks.length = 0;
			}),
			ctx.on('requestConfirmDelete', (tasks) => {
				let shouldClose = false;
				if (!this.opening) {
					this.open();
					shouldClose = true;
				}
				const { unmount, getState } = mountFileTree(
					this.detailContainer as HTMLDivElement,
					tasks,
					this.t,
				);
				const cleanupUnmount = this.modalCleanupCallbacks.subscribe(unmount);
				this.description?.setText(this.t('confirmDeleteDescription', tasks.length));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected, deselected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					this.dispatch('deleteConfirmed', {
						delete: selected as Array<RemoveLocal>,
						reupload: deselected as Array<RemoveLocal>,
					});
					if (shouldClose) this.close();
				});
			}),
			ctx.on('requestConfirmMassDelete', (counts) => {
				// Closing the dialog keeps the files: the safe answer.
				new ConfirmModal(ctx.app, {
					cancel: this.t('keepThem'),
					confirm: this.t('deleteThem'),
					message: this.t('massDeleteMessage', counts),
					onCancel: () => this.dispatch('massDeleteConfirmed', false),
					onConfirm: () => this.dispatch('massDeleteConfirmed', true),
					title: this.t('massDeleteTitle'),
				}).open();
			}),
			ctx.on('requestConfirmMassChange', (counts) => {
				// Closing the dialog stops the sync: the safe answer.
				new ConfirmModal(ctx.app, {
					cancel: this.t('stopSync'),
					confirm: this.t('continueSync'),
					message: this.t('massChangeMessage', counts),
					onCancel: () => this.dispatch('massChangeConfirmed', false),
					onConfirm: () => this.dispatch('massChangeConfirmed', true),
					title: this.t('massChangeTitle'),
				}).open();
			}),
			ctx.on('requestConfirmTasks', (tasks) => {
				if (!this.opening) this.open();
				const { unmount, getState } = mountFileTree(
					this.detailContainer as HTMLDivElement,
					tasks,
					this.t,
				);
				const cleanupUnmount = this.modalCleanupCallbacks.subscribe(unmount);
				const taskCounts: TaskCounts = {
					conflict: 0,
					deleteLocal: 0,
					deleteRemote: 0,
					total: tasks.length,
				};
				for (const { name } of tasks)
					if (name === 'removeLocal') taskCounts.deleteLocal++;
					else if (name === 'removeRemote') taskCounts.deleteRemote++;
					else if (name === 'resolveConflict') taskCounts.conflict++;
				this.description?.setText(this.t('confirmTasksDescription', taskCounts));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					this.dispatch('tasksConfirmed', selected);
				});
			}),
		);
	}

	declare readonly events: {
		tasksConfirmed: Array<BaseTask>;
		deleteConfirmed: DeleteConfirmReturn;
		massDeleteConfirmed: boolean;
		massChangeConfirmed: boolean;
	};

	declare readonly i18n: {
		syncProgress: string;
		completed: string;
		failedTasksDescription: Snippet<number>;
		confirmDeleteDescription: Snippet<number>;
		massDeleteTitle: string;
		massDeleteMessage: Snippet<{ local: number; remote: number }>;
		deleteThem: string;
		keepThem: string;
		massChangeTitle: string;
		massChangeMessage: Snippet<{ changes: number; percent: number }>;
		continueSync: string;
		confirmTasksDescription: Snippet<TaskCounts>;
		hide: string;
		confirm: string;
		cancel: string;
		done: string;
		stopSync: string;
	} & Record<TaskNames | SyncStage, string>;

	private readonly renderHideStop = () => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.t('stopSync'))
					.setDestructive()
					.onClick(() => {
						this.dispatch('syncCanceled');
						return new Promise<void>((resolve) => {
							const unsub = this.ctx.on('syncTerminated', () => {
								resolve();
								unsub();
							});
						});
					});
			})
			.addButton((button) =>
				button.setButtonText(this.t('hide')).onClick(() => this.close()),
			).settingEl;
	};
	private readonly renderConfirmCancel = (confirmCallback: () => void) => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.t('cancel'))
					.setDestructive()
					.onClick(() => this.close());
			})
			.addButton((button) =>
				button
					.setButtonText(this.t('confirm'))
					.setCta()
					.onClick(() => {
						cleanup();
						confirmCallback();
					})
					.buttonEl.focus(),
			).settingEl;
		const cleanup = this.modalCleanupCallbacks.subscribe(() => this.dispatch('syncCanceled'));
	};
	private readonly renderDone = () => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.t('done'))
				.setCta()
				.onClick(() => this.close())
				.buttonEl.focus(),
		).settingEl;
	};

	private readonly showDetails = () => {
		this.description?.show();
		this.detailContainer?.show();
	};
	private readonly hideDetails = () => {
		this.description?.hide();
		this.detailContainer?.hide();
	};

	onOpen() {
		const { contentEl } = this;
		this.setTitle(this.t('syncProgress'));

		const progress = computed(
			() =>
				describeProgress(
					this.ctx.syncStage(),
					this.ctx.walkProgress,
					this.ctx.executionProgress,
					this.t,
				),
			{ deps: [this.ctx.walkProgress, this.ctx.syncStage, this.ctx.executionProgress] },
		);

		const container = contentEl.createDiv('drive-bridge-progress-modal');
		const { bar, barEl, left, right } = renderProgress(container);
		this.description = container.createEl('p', 'drive-bridge-progress-description');
		this.description.hide();
		this.detailContainer = container.createDiv('drive-bridge-progress-details');
		this.detailContainer.hide();

		this.modalCleanupCallbacks.subscribe(
			progress.subscribe(
				({ completed, counter = true, current, percent, total }) => {
					for (const el of [right, barEl])
						if (counter) el.show();
						else el.hide();
					if (completed !== undefined && total !== undefined)
						right.setText(`${completed}/${total} ${this.t('completed')}`);
					if (current !== undefined) left.setText(current);
					if (percent !== undefined) bar.setValue(percent);
				},
				{ immediate: true },
			),
		);
		this.modalCleanupCallbacks.subscribe(() => progress.dispose());
		this.opening = true;
	}

	root = {
		hideProgress: this.close.bind(this),
		showProgress: () => {
			this.open();
			this.renderHideStop();
		},
	};

	onClose() {
		this.opening = false;
		this.description = undefined;
		this.detailContainer = undefined;
		this.controls = undefined;
		this.modalCleanupCallbacks();
		this.modalCleanupCallbacks.clear();
		this.contentEl.empty();
	}

	dispose() {
		this.onClose();
		this.moduleCleanupCallbacks.splice(0).forEach((fn) => fn());
	}
}

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
