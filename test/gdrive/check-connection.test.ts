import { expect, test } from 'bun:test';
import checkConnection from '@/gdrive/check-connection';

const respond = (status: number, json: unknown = {}) =>
	(() => Promise.resolve({ json: () => json, status })) as never;

test('a 2xx answer from Drive means connected', async () => {
	expect(await checkConnection(respond(200))).toStrictEqual({ success: true });
});

test("a refusal carries Drive's own reason, or the status", async () => {
	expect(
		await checkConnection(
			respond(403, { error: { code: 403, message: 'Drive API disabled' } }),
		),
	).toStrictEqual({ reason: 'Google Drive 403: Drive API disabled', success: false });
	expect(await checkConnection(respond(503, 'not json'))).toStrictEqual({
		reason: 'HTTP 503',
		success: false,
	});
});

test('a request that throws is a failure with its message', async () => {
	const offline = (() => Promise.reject(new Error('Network down'))) as never;
	expect(await checkConnection(offline)).toStrictEqual({
		reason: 'Network down',
		success: false,
	});
});
