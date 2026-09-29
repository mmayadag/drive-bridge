import type { SecretStorage } from 'obsidian';
import { expect, test } from 'bun:test';
import {
	LEGACY_CLIENT_SECRET_ID,
	LEGACY_REFRESH_TOKEN_ID,
	adoptLegacySecrets,
	secretIds,
	secretScope,
} from '@/gdrive/secret-scope';

function localStorage(entries: Array<[string, unknown]> = []) {
	const values = new Map(entries);
	return {
		loadLocalStorage: (key: string) => values.get(key),
		saveLocalStorage: (key: string, value: unknown) => void values.set(key, value),
		values,
	};
}

function secretStorage(entries: Array<[string, string]> = []) {
	const secrets = new Map(entries);
	const storage = {
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	return { secrets, storage: storage as unknown as SecretStorage };
}

test('a vault makes its scope once and keeps it', () => {
	const app = localStorage();
	const scope = secretScope(app);
	expect(scope).toMatch(/^[a-z0-9]{12}$/u);
	expect(secretScope(app)).toBe(scope);
});

test('a missing or malformed saved scope is replaced', () => {
	const app = localStorage([['drive-bridge-secret-scope', 'Bad Scope!']]);
	const scope = secretScope(app);
	expect(scope).not.toBe('Bad Scope!');
	expect(app.values.get('drive-bridge-secret-scope')).toBe(scope);
});

test('secret ids end in the scope and stay valid Obsidian secret ids', () => {
	const ids = secretIds('abc123def456');
	expect(ids).toStrictEqual({
		clientSecret: `${LEGACY_CLIENT_SECRET_ID}-abc123def456`,
		refreshToken: `${LEGACY_REFRESH_TOKEN_ID}-abc123def456`,
	});
	for (const id of Object.values(ids)) expect(id).toMatch(/^[a-z0-9-]+$/u);
});

test('a connected vault adopts the shared secrets once and leaves them in place', () => {
	const ids = secretIds('vault1');
	const { secrets, storage } = secretStorage([
		[LEGACY_REFRESH_TOKEN_ID, 'shared-token'],
		[LEGACY_CLIENT_SECRET_ID, 'shared-secret'],
		[ids.clientSecret, 'own-secret'],
	]);
	adoptLegacySecrets(storage, ids, true);
	expect(secrets.get(ids.refreshToken)).toBe('shared-token');
	// A secret the vault already has is never overwritten.
	expect(secrets.get(ids.clientSecret)).toBe('own-secret');
	expect(secrets.get(LEGACY_REFRESH_TOKEN_ID)).toBe('shared-token');
});

test('a vault that was never connected adopts nothing', () => {
	const ids = secretIds('vault2');
	const { secrets, storage } = secretStorage([[LEGACY_REFRESH_TOKEN_ID, 'shared-token']]);
	adoptLegacySecrets(storage, ids, false);
	expect(secrets.get(ids.refreshToken)).toBeUndefined();
});
