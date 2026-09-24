import type { Events, Translations } from '@';
import type { App, Command, EventRef } from 'obsidian';
import { Notice } from 'obsidian';
import type { Fs, ListReporter } from '@/fs';
import type { Ref } from '@/shared/reactive';
import type {
	BaseTask,
	ConflictResolver,
	Decider,
	TaskFactory,
	TaskNames,
	TaskOptionsMap,
} from '@/sync';
import type { KeptOnRemote } from '@/sync/keep-on-remote';
import type { SkipState } from '@/sync/skip-list';
import type {
	GlobMatchRule,
	MaybePromise,
	Progress,
	Stat,
	StatsMap,
	TogglableValue,
} from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import { getMessage } from '@/shared/error';
import { ref } from '@/shared/reactive';
import {
	RemoveLocal,
	CreateRemoteDir,
	Upload,
	AddRecord,
	RemoveRecord,
	convertMoves,
	syncCancelledError,
	taskMap,
} from '@/sync';
import { hideKeptOnRemote, keepOnRemote } from '@/sync/keep-on-remote';
import { findMassChange, findMassDeletion, keepDeletedFiles } from '@/sync/mass-delete';
import { narrowTo } from '@/sync/narrow';
import { prepareReporter, sortTasks } from '@/sync/plan-helpers';
import { countOutcome, withoutSkipped } from '@/sync/skip-list';
import { prepareGlobMatch } from '@/utils/glob-match';
import type { Dispatch, On } from './event-bus';
import type { Snippet, Translate } from './i18n';
import type { Infras } from './registrar';
import { registerSyncThisFile } from './sync-this-file';

export type SyncTerminateReason =
	| { result: 'cancelled' }
	| { result: 'completed' }
	| { result: 'failed'; error: string }
	| { result: 'noop' };

export type TaskInfo = { name: TaskNames; key: string; prettyName: string; isDir: boolean };
export type FailedTaskInfo = TaskInfo & { error: string };
export type RemoteLister = (info: Infras & { reporter: ListReporter }) => MaybePromise<Array<Stat>>;
export type SyncOptions = {
	decider?: Decider;
	remoteLister?: RemoteLister;
	conflictResolver?: ConflictResolver;
	detectMoves?: boolean;
	needConfirmTasks?: boolean;
	needConfirmDeletion?: boolean;
	exclusionRules?: Array<GlobMatchRule>;
	inclusionRules?: Array<GlobMatchRule>;
	/** Sync only this vault path (and the folders above it); other records stay as they are. */
	only?: string;
};

export default class Sync {
	constructor(
		private readonly ctx: {
			dispatch: Dispatch<Events>;
			initializeSync: () => Infras;
			getDecider: () => Decider;
			on: On<Events>;
			translate: Translate<Translations>;
			getConflictResolver: () => ConflictResolver;
			saveSettings: () => Promise<void>;
			addCommand: (command: Command) => Command;
			app: App;
			registerEvent: (ref: EventRef) => void;
			isIdle: Ref<boolean>;
		},
	) {
		ctx.addCommand({
			callback: () => this.retrySkipped(),
			id: 'retry-skipped-files',
			name: ctx.translate('retrySkippedFiles'),
		});
		registerSyncThisFile({ ...ctx, executeSync: this.executeSync });
	}

	private readonly retrySkipped = () => {
		this.settings.skipState = { failures: {}, skipped: [] };
		void this.ctx.saveSettings();
		new Notice(this.ctx.translate('skippedFilesCleared'));
	};

	declare readonly events: {
		syncStarted: { isCancelled: Ref<boolean>; trigger: string };
		syncInitialized: Infras & { match: (path: string) => GlobMatchResult };
		remoteWalkProgress: Progress;
		syncTerminated: SyncTerminateReason;
		requestConfirmDelete: Array<RemoveLocal>;
		requestConfirmMassDelete: { local: number; remote: number };
		requestConfirmMassChange: { changes: number; percent: number };
		requestConfirmTasks: Array<BaseTask>;
		syncCanceled: undefined;
		taskCompleted: TaskInfo;
		taskFailed: FailedTaskInfo;
		executionStarted: Array<BaseTask>;
	};
	declare readonly i18n: {
		retrySkippedFiles: string;
		skippedFilesCleared: string;
		fileSkipped: Snippet<string>;
		syncThisFile: string;
		fileSynced: string;
	};
	declare readonly settings: {
		maxFileSize: TogglableValue;
		/** Files deleted in the vault stay on Drive. */
		neverDeleteRemote: boolean;
		keptOnRemote: KeptOnRemote;
		skipState: SkipState;
		exclusionRules: Array<GlobMatchRule>;
		inclusionRules: Array<GlobMatchRule>;
	};

	private readonly postProcess = (
		stats: Array<Stat>,
		pruner: (stats: Array<Stat>) => Array<Stat>,
	) => {
		const statsMap = toMap(pruner(stats));
		const maxSize = this.settings.maxFileSize.enabled
			? this.settings.maxFileSize.value
			: Infinity;
		const includedStats: StatsMap = new Map();
		if (statsMap.size === 0) return includedStats;
		for (const [path, stat] of statsMap) {
			if (!stat.isDir && stat.size > maxSize) continue;
			includedStats.set(path, stat);
		}
		return includedStats;
	};

	/** Dispatches a request and waits for its answer; a cancelled sync rejects. */
	private readonly ask = <R extends keyof Events, A extends keyof Events>(
		request: R,
		payload: Events[R],
		answer: A,
	) =>
		new Promise<Events[A]>((resolve, reject) => {
			const { on, dispatch } = this.ctx;
			const cleanup = () => {
				offAnswer();
				offCancel();
			};
			const offAnswer = on(answer, (result) => {
				cleanup();
				resolve(result);
			});
			const offCancel = on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			(dispatch as (event: R, payload: Events[R]) => void)(request, payload);
		});

	private readonly confirmTasks = (tasks: Array<BaseTask>) =>
		this.ask('requestConfirmTasks', tasks, 'tasksConfirmed');

	private readonly confirmMassDeletion = (counts: { local: number; remote: number }) =>
		this.ask('requestConfirmMassDelete', counts, 'massDeleteConfirmed');

	private readonly confirmMassChange = (counts: { changes: number; percent: number }) =>
		this.ask('requestConfirmMassChange', counts, 'massChangeConfirmed');

	private readonly confirmDeletion = (tasks: Array<RemoveLocal>) =>
		this.ask('requestConfirmDelete', tasks, 'deleteConfirmed');

	private readonly executeSync = async (
		trigger: string,
		options: SyncOptions = {},
	): Promise<SyncTerminateReason> => {
		const {
			settings,
			ctx,
			postProcess,
			confirmDeletion,
			confirmMassChange,
			confirmMassDeletion,
			confirmTasks,
			convertDeleteToUpload,
		} = this;
		const { on, dispatch, initializeSync, getConflictResolver, translate, getDecider } = ctx;
		const {
			decider = getDecider(),
			remoteLister = async ({ remoteFs, record, reporter }) => {
				try {
					return await remoteFs.list('/', reporter);
				} catch (error) {
					if (await remoteFs.exists('/')) throw error;
					dispatch('logSync', 'Remote root deleted, recreating.');
					await Promise.all([remoteFs.mkdir('/', true), record.clear()]);
					return [];
				}
			},
			conflictResolver = getConflictResolver(),
			detectMoves = true,
			needConfirmDeletion = false,
			needConfirmTasks = false,
			inclusionRules = settings.inclusionRules,
			exclusionRules = settings.exclusionRules,
		} = options;

		const isCancelled = ref(false);
		let failedCount = 0;
		let tasks: Array<BaseTask>;
		let terminateReason!: SyncTerminateReason;
		const cleanup = on('syncCanceled', () => isCancelled(true));
		try {
			dispatch('syncStarted', { isCancelled, trigger });
			if (isCancelled()) throw syncCancelledError;

			const infras = initializeSync();
			const { record, localFs } = infras;

			const match = prepareGlobMatch(inclusionRules, exclusionRules);
			const { reporter: localReporter, pruner: localPruner } = prepareReporter(match);
			const { reporter: remoteReporter, pruner: remotePruner } = prepareReporter(match);
			dispatch('syncInitialized', { ...infras, match });

			const [localList, remoteList] = await Promise.all([
				localFs.list('/', localReporter),
				remoteLister({
					...infras,
					reporter: (prog) => {
						dispatch('remoteWalkProgress', prog);
						return remoteReporter(prog);
					},
				}),
			]);
			if (isCancelled()) throw syncCancelledError;
			const records = new Map(await record.entries());
			const localStats = postProcess(localList, localPruner);
			const remoteStats = postProcess(remoteList, remotePruner);
			if (hideKeptOnRemote(settings.keptOnRemote, localStats, remoteStats))
				void ctx.saveSettings();
			if (options.only) narrowTo(options.only, { localStats, records, remoteStats });
			dispatch(
				'logSync',
				`Local ${localStats.size} item(s), remote ${remoteStats.size} item(s), record ${records.size} item(s).`,
			);

			if (isCancelled()) throw syncCancelledError;
			const taskFactory = createTaskFactory({
				baseOptions: infras,
				resolver: conflictResolver,
				translate,
			});
			tasks = decider({
				localStats,
				logger: (log: string) => dispatch('logSync', log),
				records,
				remoteStats,
				taskFactory,
			});
			if (tasks.length === 0) {
				terminateReason = { result: 'noop' };
				return terminateReason;
			}

			if (settings.neverDeleteRemote) {
				const before = Object.keys(settings.keptOnRemote).length;
				tasks = keepOnRemote(tasks, settings.keptOnRemote, taskFactory);
				const kept = Object.keys(settings.keptOnRemote).length - before;
				if (kept) {
					dispatch('logSync', `Kept ${kept} file(s) on Drive instead of deleting them.`);
					void ctx.saveSettings();
				}
			}

			if (detectMoves) {
				const initialTasks = tasks.length;
				tasks = convertMoves(tasks, translate, records);
				const convertedTasks = initialTasks - tasks.length;
				if (convertedTasks)
					dispatch('logSync', `Discovered and converted ${convertedTasks} move task(s).`);
			}

			dispatch('logSync', `Planning finished with ${tasks.length} task(s).`);

			const [nonDisplayableTasks, displayableTasks] = partition(
				tasks,
				(task) => task instanceof AddRecord || task instanceof RemoveRecord,
			);
			const reviewed = needConfirmTasks && displayableTasks.length !== 0;
			if (reviewed) {
				const confirmResult = await confirmTasks(displayableTasks);
				tasks = [...nonDisplayableTasks, ...confirmResult];
			}

			// A reviewed task list already showed every deletion.
			let deletionsApproved = reviewed;
			const massDeletion = findMassDeletion(
				tasks,
				Math.max(localStats.size, remoteStats.size, records.size),
			);
			if (!reviewed && massDeletion.exceeded) {
				const { local, remote, threshold } = massDeletion;
				dispatch(
					'logSync',
					`${local.length} local and ${remote.length} remote deletion(s) exceed the limit of ${threshold}; asking.`,
				);
				deletionsApproved = await confirmMassDeletion({
					local: local.length,
					remote: remote.length,
				});
				if (!deletionsApproved) tasks = keepDeletedFiles(tasks, massDeletion, taskFactory);
			}

			// Many synced files changing at once usually means a bug or a wrong setting, not edits.
			const massChange = findMassChange(
				tasks,
				new Set(records.keys()),
				Math.max(localStats.size, remoteStats.size, records.size),
			);
			if (!reviewed && massChange.exceeded) {
				const { changes, percent } = massChange;
				dispatch(
					'logSync',
					`${changes} change(s) to synced files (${percent}%) exceed the limit; asking.`,
				);
				if (!(await confirmMassChange({ changes, percent }))) throw syncCancelledError;
			}

			const [removeLocalTasks, otherTasks] = partition(
				tasks,
				(task) => task instanceof RemoveLocal,
			);
			if (needConfirmDeletion && !deletionsApproved && removeLocalTasks.length !== 0) {
				const { delete: deleted, reupload } = await confirmDeletion(removeLocalTasks);
				tasks = [
					...deleted,
					...(await convertDeleteToUpload(reupload, localFs)),
					...otherTasks,
				];
			}

			sortTasks(tasks);

			const skipState = settings.skipState;
			const { run, skippedCount } = withoutSkipped(tasks, skipState.skipped);
			if (skippedCount)
				dispatch('logSync', `Skipping ${skippedCount} file(s) on the skip list.`);
			tasks = run;
			if (tasks.length === 0) {
				terminateReason = { result: 'noop' };
				return terminateReason;
			}

			if (isCancelled()) throw syncCancelledError;
			dispatch('executionStarted', tasks);
			await Promise.all(
				tasks.map(async (task) => {
					try {
						await task.exec();
						countOutcome(skipState, task.key, true);
						dispatch('taskCompleted', toTaskInfo(task));
					} catch (error) {
						if (isCancelled()) return;
						failedCount++;
						if (countOutcome(skipState, task.key, false)) {
							dispatch('logSync', `Moved \`${task.key}\` to the skip list.`);
							new Notice(translate('fileSkipped', task.key));
						}
						dispatch('taskFailed', {
							...toTaskInfo(task),
							error: getMessage(error),
						});
					}
				}),
			);
			void ctx.saveSettings();

			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: failedCount
					? {
							error: `Execution of ${failedCount} sync task(s) failed.`,
							result: 'failed',
						}
					: { result: 'completed' };
		} catch (error) {
			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: ({ error: getMessage(error), result: 'failed' } as const);
		} finally {
			cleanup();
			dispatch('syncTerminated', terminateReason);
		}
		return terminateReason;
	};

	private readonly convertDeleteToUpload = async (tasks: Array<RemoveLocal>, localFs: Fs) => {
		const final: Array<Upload | CreateRemoteDir> = [];
		await Promise.all(
			tasks.map(async (task) => {
				const options = task.options;
				const local = await localFs.stat(options.key);
				if (!local) {
					this.ctx.dispatch(
						'logSync',
						`Local file \`${options.key}\` not found during reupload.`,
					);
					return;
				}
				if (local.isDir) final.push(new CreateRemoteDir({ ...options, local }));
				else final.push(new Upload({ ...options, local }));
			}),
		);
		return final;
	};

	root = { executeSync: this.executeSync };
}

function toMap(stats: Array<Stat>): StatsMap {
	const res = new Map<string, Stat>();
	for (const stat of stats) res.set(stat.key, stat);
	return res;
}

function createTaskFactory({
	baseOptions,
	translate,
	resolver,
}: {
	baseOptions: Infras;
	translate: (name: TaskNames) => string;
	resolver: ConflictResolver;
}): TaskFactory {
	return (<N extends TaskNames>(name: N, options: TaskOptionsMap[N]) => {
		const task =
			name === 'resolveConflict'
				? new taskMap[name]({ ...options, ...baseOptions, resolver } as never)
				: new taskMap[name]({ ...options, ...baseOptions } as never);
		task.name = name;
		task.prettyName = translate(name);
		return task;
	}) as TaskFactory;
}

function partition<T, U extends T>(
	items: ReadonlyArray<T>,
	predicate: (item: T, index: number) => item is U,
): [Array<U>, Array<Exclude<T, U>>] {
	const truthy: Array<T> = [];
	const falsy: Array<T> = [];
	for (let i = 0; i < items.length; i++) (predicate(items[i], i) ? truthy : falsy).push(items[i]);
	return [truthy as Array<U>, falsy as Array<Exclude<T, U>>];
}

function toTaskInfo({ key, name, prettyName, local, remote }: BaseTask): TaskInfo {
	const isDir = local?.isDir ?? remote?.isDir ?? false;
	return { isDir, key, name, prettyName };
}
