import { expect, test } from 'bun:test';
import type { Translate } from '@/modules/i18n';
import type { ErrorTranslations } from '@/utils/describe-error';
import { classifyError, describeError } from '@/utils/describe-error';

const translate = ((key: string, count?: number) =>
	count === undefined ? key : `${key}:${count}`) as Translate<ErrorTranslations>;

test('network failures read as offline', () => {
	for (const raw of [
		'net::ERR_NAME_NOT_RESOLVED',
		'net::ERR_INTERNET_DISCONNECTED',
		'net::ERR_CONNECTION_RESET',
		'TypeError: Failed to fetch',
		'Device is offline.',
	])
		expect(classifyError(raw)).toStrictEqual({ key: 'errorOffline' });
});

test('HTTP statuses map to their causes', () => {
	expect(classifyError('Request failed, status 401')).toStrictEqual({ key: 'errorSignIn' });
	expect(classifyError('Request failed, status 429')).toStrictEqual({ key: 'errorRateLimited' });
	expect(classifyError('Request failed, status 403')).toStrictEqual({ key: 'errorForbidden' });
	expect(classifyError('Request failed, status 503')).toStrictEqual({ key: 'errorServer' });
	expect(classifyError('Request failed, status 404')).toBeUndefined();
});

test('failed tasks keep their count', () => {
	expect(describeError('Execution of 3 sync task(s) failed.', translate)).toBe(
		'errorTasksFailed:3',
	);
});

test('a recognized but count-less error translates to its plain key', () => {
	expect(describeError('Request failed, status 401', translate)).toBe('errorSignIn');
});

test('unknown errors are shown as they are', () => {
	const raw = 'Google Drive authorization expired or was revoked, please reconnect.';
	expect(describeError(raw, translate)).toBe(raw);
});
