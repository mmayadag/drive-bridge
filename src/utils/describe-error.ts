import type { Snippet, Translate } from '@/modules/i18n';

export type ErrorTranslations = {
	errorOffline: string;
	errorSignIn: string;
	errorRateLimited: string;
	errorForbidden: string;
	errorServer: string;
	errorTasksFailed: Snippet<number>;
};

type Known =
	| { key: Exclude<keyof ErrorTranslations, 'errorTasksFailed'> }
	| { key: 'errorTasksFailed'; count: number };

const OFFLINE =
	/net::ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE|TIMED_OUT|CONNECTION_\w+)|Failed to fetch|Device is offline|ENOTFOUND|ECONNRESET|ETIMEDOUT/u;

/** Recognises common sync errors; undefined for anything to show as it is. */
export function classifyError(raw: string): Known | undefined {
	if (OFFLINE.test(raw)) return { key: 'errorOffline' };
	const tasks = /Execution of (?<count>\d+) sync task/u.exec(raw)?.groups?.count;
	if (tasks) return { count: Number(tasks), key: 'errorTasksFailed' };
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
	return known.key === 'errorTasksFailed'
		? translate('errorTasksFailed', known.count)
		: translate(known.key);
}
