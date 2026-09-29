import { expect, test } from 'bun:test';
import type { Translate } from '@/modules/i18n';
import type { ErrorTranslations } from '@/utils/describe-error';
import { classifyError, describeError } from '@/utils/describe-error';

const translate = ((key: string, arg?: number | string) =>
	arg === undefined ? key : `${key}:${arg}`) as Translate<ErrorTranslations>;

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

test('errors thrown in English by the plugin core are worded for the reader', () => {
	expect(
		describeError('File write fails repeatedly, this is a known Android bug.', translate),
	).toBe('errorAndroidWrite');
	expect(
		describeError(
			'File is too large to sync on this device (limit 200 MB), sync it from a computer.',
			translate,
		),
	).toBe('errorTooLargeOnDevice');
	expect(describeError('Please set a backend!', translate)).toBe('errorNoBackend');
	expect(describeError('Please install a backend!', translate)).toBe('errorNoBackend');
	expect(describeError('Backend "s3" is not installed!', translate)).toBe('errorNoBackend');
	expect(describeError('Windows forbids character ":" in file names!', translate)).toBe(
		'errorWindowsCharacter::',
	);
	expect(describeError('Custom secret header not found: "X-Key".', translate)).toBe(
		'errorSecretHeader:X-Key',
	);
});
