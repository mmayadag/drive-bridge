import type { Snippet, Translate } from '@/modules/i18n';

export type ErrorTranslations = {
	errorOffline: string;
	errorSignIn: string;
	errorRateLimited: string;
	errorForbidden: string;
	errorServer: string;
	errorTasksFailed: Snippet<number>;
	errorAndroidWrite: string;
	errorTooLargeOnDevice: string;
	errorWindowsCharacter: Snippet<string>;
	errorNoBackend: string;
	errorSecretHeader: Snippet<string>;
	errorStorageFull: string;
	errorStorageInterrupted: string;
};

type WithCount = 'errorTasksFailed';
type WithName = 'errorWindowsCharacter' | 'errorSecretHeader';

type Known =
	| { key: Exclude<keyof ErrorTranslations, WithCount | WithName> }
	| { key: WithCount; count: number }
	| { key: WithName; name: string };

const OFFLINE =
	/net::ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE|TIMED_OUT|CONNECTION_\w+)|Failed to fetch|Device is offline|ENOTFOUND|ECONNRESET|ETIMEDOUT/u;

// Errors thrown in the plugin core stay in English, so logs read the same on every
// device; these patterns match them and they are translated only where they are shown.
const ANDROID_WRITE = /known Android bug/u;
const TOO_LARGE_ON_DEVICE = /too large to sync on this device/u;
const WINDOWS_CHARACTER = /Windows forbids character "(?<name>.)"/u;
const NO_BACKEND = /Please (?:set|install) a backend!|Backend ".*" is not installed!/u;
const SECRET_HEADER = /Custom secret header not found: "(?<name>.*)"/u;
// IndexedDB, where sync keeps its records and Drive snapshot (see shared/indexed-db).
const STORAGE_FULL = /QuotaExceededError/u;
const STORAGE_INTERRUPTED = /IndexedDB (?:request|transaction) (?:aborted|failed)/u;

/** Recognises common sync errors; undefined for anything to show as it is. */
export function classifyError(raw: string): Known | undefined {
	if (OFFLINE.test(raw)) return { key: 'errorOffline' };
	const tasks = /Execution of (?<count>\d+) sync task/u.exec(raw)?.groups?.count;
	if (tasks) return { count: Number(tasks), key: 'errorTasksFailed' };
	if (ANDROID_WRITE.test(raw)) return { key: 'errorAndroidWrite' };
	if (TOO_LARGE_ON_DEVICE.test(raw)) return { key: 'errorTooLargeOnDevice' };
	if (NO_BACKEND.test(raw)) return { key: 'errorNoBackend' };
	if (STORAGE_FULL.test(raw)) return { key: 'errorStorageFull' };
	if (STORAGE_INTERRUPTED.test(raw)) return { key: 'errorStorageInterrupted' };
	const character = WINDOWS_CHARACTER.exec(raw)?.groups?.name;
	if (character) return { key: 'errorWindowsCharacter', name: character };
	const header = SECRET_HEADER.exec(raw)?.groups?.name;
	if (header !== undefined) return { key: 'errorSecretHeader', name: header };
	const status = Number(/status (?<status>\d{3})\b/u.exec(raw)?.groups?.status);
	if (status === 401) return { key: 'errorSignIn' };
	if (status === 429) return { key: 'errorRateLimited' };
	if (status === 403) return { key: 'errorForbidden' };
	if (status >= 500 && status < 600) return { key: 'errorServer' };
}

/** A sentence for a raw sync error, or the raw text when it is not recognised. */
export function describeError(raw: string, translate: Translate<ErrorTranslations>) {
	const known = classifyError(raw);
	if (!known) return raw;
	if ('count' in known) return translate(known.key, known.count);
	if ('name' in known) return translate(known.key, known.name);
	return translate(known.key);
}
