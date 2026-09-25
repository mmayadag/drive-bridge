// The Google Drive module: its default folder, the secrets a settings export carries, what
// Reset to defaults changes, and what start registers (and dispose removes) in the core.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { FsWrapperEntry, RemoteFsEntry, RequestParam } from '@/modules/registrar';
import type { SettingEntry } from '@/modules/setting';

type HttpResponse = { json?: unknown; status?: number };
let responses: Array<HttpResponse> = [];
const requests: Array<RequestParam & { url?: string }> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam & { url?: string }) => {
		requests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		return Promise.resolve({ json: response.json, status: response.status ?? 200 });
	},
}));

const { default: Gdrive } = await import('@/gdrive');
const { default: GdriveFs } = await import('@/gdrive/fs');
const { openMemoryDB } = await import('@/shared/key-value-store');

const FULL_DRIVE = 'https://www.googleapis.com/auth/drive';
const REFRESH_ID = 'drive-bridge-gdrive-refresh-token';
const SECRET_ID = 'drive-bridge-gdrive-client-secret';

function reset(...next: Array<HttpResponse>) {
	requests.length = 0;
	responses = [...next];
}

function setup(entries: Array<[string, string]> = []) {
	const secrets = new Map(entries);
	const translations: Array<unknown> = [];
	const remoteFs = new Map<string, RemoteFsEntry>();
	const wrappers: Array<FsWrapperEntry> = [];
	const middlewares: Array<{ apply: (request: never) => unknown; priority: number }> = [];
	const settingEntries: Array<SettingEntry> = [];
	const removed: Array<string> = [];
	const logs: Array<unknown> = [];
	const ctx = {
		app: {
			secretStorage: {
				deleteSecret: (id: string) => void secrets.delete(id),
				getSecret: (id: string) => secrets.get(id),
				setSecret: (id: string, value: string) => void secrets.set(id, value),
			},
			vault: { getName: () => 'My vault' },
		},
		dispatch: (name: string, payload: unknown) => void logs.push([name, payload]),
		indexedDB: openMemoryDB('gdrive-index-test-snapshots'),
		memoryDB: openMemoryDB('gdrive-index-test'),
		registerRemoteFs: (id: string, entry: RemoteFsEntry) => {
			remoteFs.set(id, entry);
			return () => void removed.push('remoteFs');
		},
		registerRemoteFsWrapper: (entry: FsWrapperEntry) => {
			wrappers.push(entry);
			return () => void removed.push('wrapper');
		},
		registerRemoteRequestMiddleware: (entry: {
			apply: (request: never) => unknown;
			priority: number;
		}) => {
			middlewares.push(entry);
			return () => void removed.push('middleware');
		},
		registerSetting: (entry: SettingEntry) => {
			settingEntries.push(entry);
			return () => void removed.push('setting');
		},
		registerTranslations: (resource: unknown) => void translations.push(resource),
		translate: (key: string, ...args: Array<unknown>) =>
			args.length ? `${key}(${args.join(',')})` : key,
	};
	const gdrive = new Gdrive(ctx as never);
	Object.assign(gdrive, { settings: { remoteFs: 'gdrive' } });
	return {
		gdrive,
		logs,
		middlewares,
		remoteFs,
		removed,
		secrets,
		settingEntries,
		translations,
		wrappers,
	};
}

test('the constructor defaults the Drive folder to the vault name and registers translations', () => {
	const { gdrive, translations } = setup();
	expect(gdrive.moduleSettings.baseDirectory).toBe('My vault/');
	expect(translations).toHaveLength(1);
});

test('secrets export only what is stored', () => {
	expect(setup().gdrive.secrets.export()).toStrictEqual({});
	const { gdrive } = setup([
		[SECRET_ID, 'client-secret'],
		[REFRESH_ID, '1//refresh'],
	]);
	expect(gdrive.secrets.export()).toStrictEqual({
		clientSecret: 'client-secret',
		refreshToken: '1//refresh',
	});
});

test('importing only a client secret stores it and reports nothing', async () => {
	reset();
	const { gdrive, secrets } = setup();
	expect(await gdrive.secrets.import({ clientSecret: 'imported' })).toBeUndefined();
	expect(secrets.get(SECRET_ID)).toBe('imported');
	expect(requests).toHaveLength(0);
});

test('importing a refresh token connects the account', async () => {
	reset(
		{ json: { access_token: 'access', expires_in: 3600, scope: FULL_DRIVE } },
		{ json: { user: { emailAddress: 'me@test', permissionId: 'perm-1' } } },
	);
	const { gdrive, secrets } = setup();
	gdrive.moduleSettings.clientId = 'client';
	const line = await gdrive.secrets.import({
		clientSecret: 'secret',
		refreshToken: '1//imported',
	});
	expect(line).toBe('accountConnectedDescription(me@test)');
	expect(gdrive.moduleSettings.userId).toBe('perm-1');
	expect(gdrive.moduleSettings.accountEmail).toBe('me@test');
	expect(secrets.get(REFRESH_ID)).toBe('1//imported');
});

test('importing a refresh token that fails reports why', async () => {
	reset({ json: { error: 'invalid_grant' }, status: 400 });
	const { gdrive, secrets } = setup([[SECRET_ID, 'secret']]);
	gdrive.moduleSettings.clientId = 'client';
	const line = await gdrive.secrets.import({ refreshToken: '1//imported' });
	expect(line).toStartWith('authorizationFailed(');
	expect(line).toContain('authorization expired');
	expect(secrets.has(REFRESH_ID)).toBe(false);
	expect(gdrive.moduleSettings.userId).toBe('');
});

test('importing a refresh token without a client reports an invalid token', async () => {
	reset();
	const { gdrive } = setup();
	const line = await gdrive.secrets.import({ refreshToken: '1//imported' });
	expect(line).toBe('authorizationFailed(invalidRefreshToken)');
	expect(requests).toHaveLength(0);
});

test('resetSettings restores trash and full scans but keeps the account and folder', () => {
	const { gdrive } = setup();
	Object.assign(gdrive.moduleSettings, {
		accountEmail: 'me@test',
		baseDirectory: 'Notes/',
		clientId: 'client',
		remoteScan: 'changes',
		useTrash: false,
		userId: 'perm-1',
	});
	gdrive.resetSettings();
	expect(gdrive.moduleSettings).toStrictEqual({
		accountEmail: 'me@test',
		baseDirectory: 'Notes/',
		clientId: 'client',
		remoteScan: 'full',
		useTrash: true,
		userId: 'perm-1',
	});
});

test('start registers the Drive backend, its folder wrapper, the bearer token and the settings', () => {
	const { gdrive, remoteFs, wrappers, middlewares, settingEntries } = setup();
	gdrive.start();
	const entry = remoteFs.get('gdrive');
	expect(entry?.prettyName()).toBe('gdrive');
	expect(typeof entry?.checkConnection).toBe('function');
	expect(wrappers.map((wrapper) => wrapper.priority)).toEqual([5998]);
	expect(middlewares.map((middleware) => middleware.priority)).toEqual([305]);
	expect(settingEntries.map((setting) => setting.priority)).toEqual([683]);
	gdrive.dispose();
});

test('the backend builds a Drive file system that logs through the event bus', () => {
	const { gdrive, remoteFs, logs } = setup();
	gdrive.moduleSettings.userId = 'perm-1';
	gdrive.start();
	const fs = remoteFs.get('gdrive')?.instantiate((() => {}) as never);
	expect(fs).toBeInstanceOf(GdriveFs);
	expect(fs?.getUid()).toBe('gdrive~perm-1');
	(fs as unknown as { log: (line: string) => void }).log('hello');
	expect(logs).toContainEqual(['logSync', 'hello']);
	gdrive.dispose();
});

test('the folder wrapper only scopes a Drive file system', () => {
	const { gdrive, remoteFs, wrappers } = setup();
	gdrive.start();
	const [wrapper] = wrappers;
	const driveFs = remoteFs.get('gdrive')?.instantiate((() => {}) as never);
	const scoped = wrapper.apply(driveFs as never) as { original: unknown } | undefined;
	expect(scoped?.original).toBe(driveFs);
	expect(wrapper.apply({ getUid: () => 'other' } as never)).toBeUndefined();
	gdrive.dispose();
});

test('the bearer middleware only applies while Drive is the backend', async () => {
	reset({ json: { access_token: 'access', expires_in: 3600, scope: FULL_DRIVE } });
	const { gdrive, middlewares } = setup([
		[SECRET_ID, 'secret'],
		[REFRESH_ID, '1//refresh'],
	]);
	gdrive.moduleSettings.clientId = 'client';
	gdrive.start();
	const [middleware] = middlewares;
	const sent: Array<RequestParam | undefined> = [];
	const request = ((_url: string, params?: RequestParam) => {
		sent.push(params);
		return Promise.resolve({ status: 200 });
	}) as never;

	Object.assign(gdrive, { settings: { remoteFs: 'other' } });
	expect(middleware.apply(request)).toBeUndefined();

	Object.assign(gdrive, { settings: { remoteFs: 'gdrive' } });
	const authorized = middleware.apply(request) as (url: string, params?: object) => unknown;
	await authorized('https://www.googleapis.com/drive/v3/files', { method: 'GET' });
	expect(sent[0]?.headers).toMatchObject({ Authorization: 'Bearer access' });
	gdrive.dispose();
});

test('dispose removes everything start registered, once', () => {
	const { gdrive, removed } = setup();
	gdrive.start();
	gdrive.dispose();
	expect(removed.toSorted()).toEqual(['middleware', 'remoteFs', 'setting', 'wrapper']);
	gdrive.dispose();
	expect(removed).toHaveLength(4);
});
