import type { SecretStorage } from 'obsidian';
import ObsidianMock from '$/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam } from '@/sdk';
import { testKit } from '@/sdk/dev';

const { request } = testKit;

type HttpResponse = { json?: unknown; status?: number; throw?: Error };
const requests: Array<RequestParam> = [];
let responses: Array<HttpResponse> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam) => {
		requests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		if (response.throw) return Promise.reject(response.throw);
		return Promise.resolve({ json: response.json, status: response.status ?? 200 });
	},
}));

const { TokenManager, bearerMiddleware, fetchAccount, parseRefreshToken } =
	await import('@/gdrive/auth');

const credentials = { clientId: 'my-client', clientSecret: 'my-secret' };

function reset(...next: Array<HttpResponse>) {
	requests.length = 0;
	responses = [...next];
}

function secretStorage(entries: Array<[string, string]> = []) {
	const secrets = new Map(entries);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	return { secrets, storage: storage as unknown as SecretStorage };
}

const FULL_DRIVE = 'https://www.googleapis.com/auth/drive';

test('parses a bare refresh token and rclone output', () => {
	expect(parseRefreshToken('  1//abc-DEF_123  ')).toBe('1//abc-DEF_123');
	const rclone = JSON.stringify({ access_token: 'a', expiry: 'x', refresh_token: '1//r' });
	expect(parseRefreshToken(rclone)).toBe('1//r');
	expect(parseRefreshToken(`token = ${rclone}`)).toBe('1//r');
	expect(parseRefreshToken('{"access_token":"a"}')).toBeUndefined();
	expect(parseRefreshToken('not a token')).toBeUndefined();
	expect(parseRefreshToken('')).toBeUndefined();
});

test('reads the account id and email from Drive', async () => {
	reset({ json: { user: { emailAddress: 'me@test', permissionId: 'perm-1' } } });
	expect(await fetchAccount('access')).toStrictEqual({ email: 'me@test', userId: 'perm-1' });
	expect(requests[0]?.headers?.Authorization).toBe('Bearer access');
	expect(String((requests[0] as { url?: string } | undefined)?.url)).toContain('/about');
});

test('fails to read the account on an error response', async () => {
	reset({ json: { error: 'nope' }, status: 401 });
	let caught: unknown;
	try {
		await fetchAccount('access');
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('HTTP 401');
});

test('refresh sends the user client and records the granted scope', async () => {
	reset({ json: { access_token: 'a', expires_in: 3600, scope: `${FULL_DRIVE} openid` } });
	const { storage } = secretStorage([
		['drive-bridge-gdrive-refresh-token', 'refresh'],
		['drive-bridge-gdrive-client-secret', 'my-secret'],
	]);
	const manager = new TokenManager(storage, () => 'my-client');
	expect(await manager.getToken()).toBe('a');
	expect(String(requests[0]?.body)).toContain('client_id=my-client');
	expect(String(requests[0]?.body)).toContain('client_secret=my-secret');
	expect(manager.hasFullDriveScope()).toBe(true);
});

test('detects a token limited to drive.file', async () => {
	reset({ json: { access_token: 'a', expires_in: 3600, scope: `${FULL_DRIVE}.file` } });
	const { storage } = secretStorage([
		['drive-bridge-gdrive-refresh-token', 'refresh'],
		['drive-bridge-gdrive-client-secret', 'my-secret'],
	]);
	const manager = new TokenManager(storage, () => 'my-client');
	await manager.getToken();
	expect(manager.hasFullDriveScope()).toBe(false);
});

test('caches tokens and retries bearer requests after a 401', async () => {
	reset(
		{ json: { access_token: 'first', expires_in: 3600 } },
		{ json: { access_token: 'second', expires_in: 3600 } },
	);
	const secrets = new Map([
		['drive-bridge-gdrive-refresh-token', 'refresh'],
		['drive-bridge-gdrive-client-secret', 'my-secret'],
	]);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const manager = new TokenManager(storage as unknown as SecretStorage, () => 'my-client');
	const seen: Array<string | undefined> = [];
	const req = request((url, params) => {
		seen.push(params.headers?.Authorization);
		if (seen.length === 1) {
			const error = new Error('Unauthorized') as Error & { status: number };
			error.status = 401;
			return Promise.reject(error);
		}
		return { status: 200 };
	});

	const wrapped = bearerMiddleware(req.request, manager);
	expect((await wrapped('https://drive.test')).status).toBe(200);
	expect(seen).toStrictEqual(['Bearer first', 'Bearer second']);
});

test('refuses to refresh without a client configured', async () => {
	reset();
	const secrets = new Map([['drive-bridge-gdrive-refresh-token', 'refresh']]);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const manager = new TokenManager(storage as unknown as SecretStorage, () => '');
	let caught: unknown;
	try {
		await manager.getToken();
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('client ID and client secret');
	expect(requests).toHaveLength(0);
});

test('stores the client secret in secret storage and clears it when emptied', () => {
	const secrets = new Map<string, string>();
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const manager = new TokenManager(storage as unknown as SecretStorage, () => 'my-client');
	manager.setClientSecret('my-secret');
	expect(manager.getCredentials()).toStrictEqual(credentials);
	expect(manager.hasCredentials()).toBe(true);
	manager.setClientSecret('');
	expect(secrets.has('drive-bridge-gdrive-client-secret')).toBe(false);
	expect(manager.hasCredentials()).toBe(false);
});
