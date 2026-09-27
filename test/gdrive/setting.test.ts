import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionPage } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const { TokenManager } = await import('@/gdrive/auth');
const { default: gdriveSetting, describeAccount } = await import('@/gdrive/setting');
const { ADVANCED, DELETIONS, MORE, PAGE } = await import('@/settings/layout');

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
	const prompt = tree[16](tree[16]) as unknown as SettingDefinitionPage;
	const page = group.items?.[0] as SettingDefinitionPage;
	// The page's rows sit in two groups: connecting, and where the client comes from.
	const shown = rows(page)
		.filter((item) => call(item.visible ?? true))
		.map((item) => item.name);
	return { group, page, prompt, shown, tree };
}

/** A page's rows, through its groups, leaving out groups that are hidden. */
function rows(page: SettingDefinitionPage) {
	return (
		page.items as Array<SettingDefinition & { type?: string; items?: Array<SettingDefinition> }>
	).flatMap((item) =>
		item.type === 'group' ? (call(item.visible ?? true) ? (item.items ?? []) : []) : [item],
	);
}

const call = (value: unknown) => (typeof value === 'function' ? (value as () => unknown)() : value);

test('leaves the account and the folder in the Google Drive section', () => {
	const { group, tree } = setup({});
	expect(group.items?.map((item) => item.name)).toStrictEqual(['googleAccount', 'baseDirectory']);
	// Delete to trash sits with the other deletion setting, Drive scan under Advanced.
	const others = tree as unknown as Record<number, Record<number, unknown>>;
	const trash = (others[DELETIONS][2000] as () => SettingDefinition)();
	expect(trash.name).toBe('useTrash');
	const advanced = others[MORE][PAGE.advanced] as Record<
		number,
		(self: unknown) => SettingDefinitionGroup
	>;
	const backend = advanced[ADVANCED.backend](advanced[ADVANCED.backend]);
	expect(backend.heading).toBe('gdrive');
	expect(backend.items?.map((item) => item.name)).toStrictEqual(['remoteScan']);
});

test('a device that is not connected sees the account page first, as Connect your Google account', () => {
	const { prompt } = setup({});
	expect(prompt.type).toBe('page');
	expect(prompt.name).toBe('connectPrompt');
	expect(call(prompt.visible)).toBe(true);
	expect(rows(prompt).map((item) => item.name)).toContain('clientId');
	const connected = setup({ clientId: 'client', secret: 'secret', token: '1//token' });
	expect(call(connected.prompt.visible)).toBe(false);
});

test('asks for the whole setup until an account is connected', () => {
	const { page, shown } = setup({ clientId: 'client', secret: 'secret' });
	expect(call(page.status)).toBe('warning');
	expect(call(page.displayValue)).toBe('clickToConnect');
	// The client, then two ways to connect with an "or" between them, then the ways to get it.
	expect(shown).toStrictEqual([
		'clientId',
		'clientSecret',
		'connectAccount',
		'or',
		'signInWithGoogle',
		'setupPage',
		'setUpFromDevice',
	]);
	const setupPage = rows(page).find((item) => item.name === 'setupPage') as SettingDefinitionPage;
	expect((setupPage.items as Array<SettingDefinition>).map((item) => item.name)).toStrictEqual([
		'dummy',
		'1. stepProject',
		'2. stepDriveApi',
		'3. stepConsent',
		'4. stepClient',
		'5. signInWithGoogle',
	]);
	// The setup page is marked as a guide.
	expect(
		(setupPage as { labels?: Array<{ text: string }> }).labels?.map((label) => label.text),
	).toStrictEqual(['guide']);
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
	expect(shown).toStrictEqual(['accountConnected', 'connection', 'setUpAnotherDevice']);
});

test('keeps the client fields reachable when this device lacks the secret', () => {
	const { page, shown } = setup({ clientId: 'client', token: '1//token' });
	expect(call(page.status)).toBe('warning');
	// No export without the whole client on this device.
	expect(shown).toStrictEqual([
		'clientId',
		'clientSecret',
		'accountConnected',
		'connection',
		'setupPage',
	]);
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
