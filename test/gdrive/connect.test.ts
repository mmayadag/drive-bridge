import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam } from '@/modules/registrar';

type HttpResponse = { json?: unknown; status?: number };
let responses: Array<HttpResponse> = [];
const requests: Array<RequestParam> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam) => {
		requests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		return Promise.resolve({ json: response.json, status: response.status ?? 200 });
	},
}));

const { TokenManager } = await import('@/gdrive/auth');
const { connectWithToken } = await import('@/gdrive/connect');

const FULL_DRIVE = 'https://www.googleapis.com/auth/drive';
const REFRESH_ID = 'drive-bridge-gdrive-refresh-token';
const SECRET_ID = 'drive-bridge-gdrive-client-secret';

function manager(entries: Array<[string, string]>, clientId = 'my-client') {
	const secrets = new Map(entries);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		// Obsidian's getSecret returns null, not undefined, for a missing secret.
		// oxlint-disable-next-line unicorn/no-null
		getSecret: (id: string) => secrets.get(id) ?? null,
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	return { manager: new TokenManager(storage as never, () => clientId), secrets };
}

function reset(...next: Array<HttpResponse>) {
	requests.length = 0;
	responses = [...next];
}

test('refuses to connect without a client', async () => {
	reset();
	const { manager: tokens } = manager([], '');
	expect(await connectWithToken(tokens, '1//token')).toStrictEqual({ status: 'noClient' });
	expect(requests).toHaveLength(0);
});

test('refuses input that is not a token', async () => {
	reset();
	const { manager: tokens } = manager([[SECRET_ID, 'secret']]);
	expect(await connectWithToken(tokens, 'hello there')).toStrictEqual({ status: 'badToken' });
	expect(requests).toHaveLength(0);
});

test('stores the token and returns the account', async () => {
	reset(
		{ json: { access_token: 'access', expires_in: 3600, scope: FULL_DRIVE } },
		{ json: { user: { emailAddress: 'me@test', permissionId: 'perm-1' } } },
	);
	const { manager: tokens, secrets } = manager([[SECRET_ID, 'secret']]);

	expect(await connectWithToken(tokens, '1//new-token')).toStrictEqual({
		account: { email: 'me@test', userId: 'perm-1' },
		status: 'connected',
	});
	expect(secrets.get(REFRESH_ID)).toBe('1//new-token');
});

test('rejects a token limited to drive.file and keeps the old one', async () => {
	reset({ json: { access_token: 'access', expires_in: 3600, scope: `${FULL_DRIVE}.file` } });
	const { manager: tokens, secrets } = manager([
		[SECRET_ID, 'secret'],
		[REFRESH_ID, '1//old-token'],
	]);

	expect(await connectWithToken(tokens, '1//new-token')).toStrictEqual({
		status: 'limitedScope',
	});
	expect(secrets.get(REFRESH_ID)).toBe('1//old-token');
});

test('keeps no token when the first connection fails', async () => {
	reset({ json: { error: 'invalid_grant' }, status: 400 });
	const { manager: tokens, secrets } = manager([[SECRET_ID, 'secret']]);

	const result = await connectWithToken(tokens, '1//new-token');
	expect(result.status).toBe('failed');
	expect(secrets.has(REFRESH_ID)).toBe(false);
});
