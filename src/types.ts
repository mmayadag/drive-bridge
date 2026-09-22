// The one deliberate `any` in the plugin.
// Generic plumbing needs a type that stays assignable in both directions.
// That rules out `unknown`.
// Module context, translations and task factories all rely on it.
// Nothing ever reads a value at this type.
// oxlint-disable-next-line typescript/no-explicit-any
export type General = any;
export type { Binary } from '@/shared/binary';

export type MaybePromise<T> = Promise<T> | T;
export type TogglableValue<T = number> = { enabled: boolean; value: T };

export type FileStat = {
	isDir: false;
	key: string;
	mtime: number;
	size: number;
	// Etag or other kinds of string whose equality signifies the file is unchanged
	uid: string;
};
export type FolderStat = {
	isDir: true;
	key: string;
};
export type Stat = FileStat | FolderStat;
export type RecordStat = { isDir: false; local: string; remote: string } | { isDir: true };
export type StatsMap = Map<string, Stat>;
export type RecordStatsMap = Map<string, RecordStat>;

export type GlobMatchRule = {
	expr: string;
	caseSensitive: boolean;
};

export type Progress<T = string> = {
	total: number;
	completed: number;
	current?: T;
};
