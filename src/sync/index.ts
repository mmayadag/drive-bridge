export { default as CreateLocalDir } from './tasks/create-local-dir';
export { default as CreateRemoteDir } from './tasks/create-remote-dir';
export { default as Download } from './tasks/download';
export { default as Upload } from './tasks/upload';
export { default as RemoveLocal } from './tasks/remove-local';
export { default as RemoveRemote } from './tasks/remove-remote';
export { default as AddRecord } from './tasks/add-record';
export { default as RemoveRecord } from './tasks/remove-record';
export { default as ResolveConflict } from './tasks/resolve-conflict';
export { default as MoveLocal } from './tasks/move-local';
export { default as MoveRemote } from './tasks/move-remote';
export type {
	BaseTask,
	BaseTaskOptions,
	TaskNames,
	ConflictResolver,
	ConflictResolverPayload,
} from './tasks/interface';
export type {
	TaskOptions,
	TaskFactory,
	TaskOptionsMap,
	Decider,
	DeciderInput,
} from './decision/interface';
export { taskMap } from './decision/interface';
export { default as convertMoves } from './utils/detect-moves';
export { default as bidirectionalDecider } from './decision/bidirectional';
export { mirrorLocalDecider, mirrorRemoteDecider } from './decision/mirror';
export { default as keepRemoteResolver } from './conflict-resolve/keep-remote';
export { default as keepLocalResolver } from './conflict-resolve/keep-local';
export { default as latestSurviveResolver } from './conflict-resolve/latest-survive';
export { default as renameAndKeepBothResolver } from './conflict-resolve/rename-and-keep-both';
export const syncCancelledError = new Error('Sync cancelled by user.');
