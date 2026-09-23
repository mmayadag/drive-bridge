import type { SettingDefinitionGroup, SettingDefinitionPage } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const { TokenManager } = await import('@/gdrive/auth');
const { default: gdriveSetting } = await import('@/gdrive/setting');

const SECRET_ID = 'drive-bridge-gdrive-client-secret';

function oauthPage(clientId: string, secret?: string) {
	const secrets = new Map(secret ? [[SECRET_ID, secret]] : []);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const tree = gdriveSetting(
		{ matchLabel: () => ({ text: 'match' }), translate: (key: string) => key } as never,
		{ clientId } as never,
		new TokenManager(storage as never, () => clientId),
	) as Record<number, (self: unknown) => SettingDefinitionGroup>;
	const group = tree[551](tree[551]);
	return group.items?.find((item) => item.name === 'oauthClient') as SettingDefinitionPage;
}

const call = (value: unknown) => (typeof value === 'function' ? (value as () => unknown)() : value);

test('warns on the OAuth client entry until both credentials are set', () => {
	for (const page of [oauthPage(''), oauthPage('client'), oauthPage('', 'secret')]) {
		expect(call(page.status)).toBe('warning');
		expect(call(page.displayValue)).toBe('oauthClientMissing');
	}
});

test('shows a configured client without a warning', () => {
	const page = oauthPage('client', 'secret');
	expect(call(page.status)).toBeFalsy();
	expect(call(page.displayValue)).toBe('oauthClientSet');
});

test('keeps the setup tip and both client fields inside the page', () => {
	const names = oauthPage('').items?.map((item) => ('name' in item ? item.name : ''));
	expect(names).toStrictEqual(['dummy', 'clientId', 'clientSecret']);
});
