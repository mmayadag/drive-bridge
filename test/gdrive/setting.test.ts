import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionPage } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const { TokenManager } = await import('@/gdrive/auth');
const { default: gdriveSetting, describeAccount } = await import('@/gdrive/setting');

const SECRET_ID = 'drive-bridge-gdrive-client-secret';
const REFRESH_ID = 'drive-bridge-gdrive-refresh-token';

function setup({
	clientId = '',
	email = '',
	secret = '',
	token = '',
}: {
	clientId?: string;
	email?: string;
	secret?: string;
	token?: string;
}) {
	const secrets = new Map<string, string>();
	if (secret) secrets.set(SECRET_ID, secret);
	if (token) secrets.set(REFRESH_ID, token);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const tree = gdriveSetting(
		{
			matchLabel: () => ({ text: 'match' }),
			openImportSettings: () => {},
			translate: (key: string) => key,
		} as never,
		{ accountEmail: email, clientId } as never,
		new TokenManager(storage as never, () => clientId),
	) as Record<number, (self: unknown) => SettingDefinitionGroup>;
	const group = tree[551](tree[551]);
	const page = group.items?.[0] as SettingDefinitionPage;
	const shown = (page.items as Array<SettingDefinition>)
		.filter((item) => call(item.visible ?? true))
		.map((item) => item.name);
	return { group, page, shown };
}

const call = (value: unknown) => (typeof value === 'function' ? (value as () => unknown)() : value);

test('leaves four rows in the Google Drive section', () => {
	const names = setup({}).group.items?.map((item) => item.name);
	expect(names).toStrictEqual(['googleAccount', 'baseDirectory', 'useTrash', 'remoteScan']);
});

test('asks for the whole setup until an account is connected', () => {
	const { page, shown } = setup({ clientId: 'client', secret: 'secret' });
	expect(call(page.status)).toBe('warning');
	expect(call(page.displayValue)).toBe('clickToConnect');
	// The three fields first, then the ways to get them.
	expect(shown).toStrictEqual([
		'clientId',
		'clientSecret',
		'connectAccount',
		'signInWithGoogle',
		'setupPage',
		'setUpFromDevice',
	]);
	const setupPage = (page.items as Array<SettingDefinition>).find(
		(item) => item.name === 'setupPage',
	) as SettingDefinitionPage;
	expect((setupPage.items as Array<SettingDefinition>).map((item) => item.name)).toStrictEqual([
		'dummy',
		'1. stepProject',
		'2. stepDriveApi',
		'3. stepConsent',
		'4. stepClient',
	]);
});

test('shows only the account once connected', () => {
	const { page, shown } = setup({
		clientId: 'client',
		email: 'me@test',
		secret: 'secret',
		token: '1//token',
	});
	expect(call(page.status)).toBeFalsy();
	expect(call(page.displayValue)).toBe('me@test');
	expect(shown).toStrictEqual(['accountConnected']);
});

test('keeps the client fields reachable when this device lacks the secret', () => {
	const { page, shown } = setup({ clientId: 'client', token: '1//token' });
	expect(call(page.status)).toBe('warning');
	expect(shown).toStrictEqual(['clientId', 'clientSecret', 'accountConnected', 'setupPage']);
});

test('the account entry says what to do next', () => {
	const base = {
		clientId: 'id',
		clientSecret: 'secret',
		connected: true,
		email: '',
		mobile: false,
	};
	expect(describeAccount({ ...base, connected: false })).toStrictEqual({ key: 'clickToConnect' });
	expect(describeAccount({ ...base, connected: false, mobile: true })).toStrictEqual({
		key: 'tapToConnect',
	});
	expect(describeAccount({ ...base, clientSecret: '' })).toStrictEqual({
		key: 'clientSecretMissing',
	});
	expect(describeAccount({ ...base, clientId: '' })).toStrictEqual({ key: 'clientIdMissing' });
	expect(describeAccount(base)).toStrictEqual({ key: 'connected' });
	expect(describeAccount({ ...base, email: 'me@test' })).toStrictEqual({
		email: 'me@test',
		key: 'connected',
	});
});
