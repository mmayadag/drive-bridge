import type { FileStat, FolderStat, Stat, RecordStatsMap, StatsMap } from '@/types';
import type { BaseTask, TaskNames } from '../tasks/interface';
import AddRecord from '../tasks/add-record';
import CreateLocalDir from '../tasks/create-local-dir';
import CreateRemoteDir from '../tasks/create-remote-dir';
import Download from '../tasks/download';
import MoveLocal from '../tasks/move-local';
import MoveRemote from '../tasks/move-remote';
import RemoveLocal from '../tasks/remove-local';
import RemoveRecord from '../tasks/remove-record';
import RemoveRemote from '../tasks/remove-remote';
import ResolveConflict from '../tasks/resolve-conflict';
import Upload from '../tasks/upload';

export type TaskOptions = {
	key: string;
	remote?: Stat;
	local?: Stat;
};

export type OptionsWithRemoteFileStat = {
	remote: FileStat;
} & TaskOptions;

export type OptionsWithLocalFileStat = {
	local: FileStat;
} & TaskOptions;

export type OptionsWithRemoteFolderStat = {
	remote: FolderStat;
} & TaskOptions;

export type OptionsWithLocalFolderStat = {
	local: FolderStat;
} & TaskOptions;

export type OptionsWithLocalStat = {
	local: Stat;
} & TaskOptions;

export type OptionsWithRemoteStat = {
	remote: Stat;
} & TaskOptions;

export type OptionsWithBothStats = {
	local: Stat;
	remote: Stat;
} & TaskOptions;

export type OptionsWithBothFileStats = {
	local: FileStat;
	remote: FileStat;
} & TaskOptions;

export type OptionsWithLocalStatAndOldKey = {
	local: Stat;
	oldKey: string;
} & TaskOptions;

export type OptionsWithRemoteStatAndOldKey = {
	remote: Stat;
	oldKey: string;
} & TaskOptions;

export type TaskOptionsMap = {
	download: OptionsWithRemoteFileStat;
	upload: OptionsWithLocalFileStat;
	resolveConflict: OptionsWithBothFileStats;
	removeLocal: OptionsWithLocalStat;
	removeRemote: OptionsWithRemoteStat;
	createLocalDir: OptionsWithRemoteFolderStat;
	createRemoteDir: OptionsWithLocalFolderStat;
	removeRecord: TaskOptions;
	addRecord: OptionsWithBothStats;
	moveLocal: OptionsWithRemoteStatAndOldKey;
	moveRemote: OptionsWithLocalStatAndOldKey;
};
export const taskMap = {
	addRecord: AddRecord,
	createLocalDir: CreateLocalDir,
	createRemoteDir: CreateRemoteDir,
	download: Download,
	moveLocal: MoveLocal,
	moveRemote: MoveRemote,
	removeLocal: RemoveLocal,
	removeRecord: RemoveRecord,
	removeRemote: RemoveRemote,
	resolveConflict: ResolveConflict,
	upload: Upload,
} as const;
export type TaskFactory = <N extends TaskNames>(
	name: N,
	options: TaskOptionsMap[N],
) => InstanceType<(typeof taskMap)[N]>;

export type Decider = (input: DeciderInput) => Array<BaseTask>;

export type DeciderInput = {
	localStats: StatsMap;
	remoteStats: StatsMap;
	records: RecordStatsMap;
	taskFactory: TaskFactory;
	logger: (log: string) => void;
};
