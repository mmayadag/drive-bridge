import type { SecretStorage } from 'obsidian';

// Obsidian's secret storage is per vault on desktop but, on iOS and Android, shared by
// every vault on the device: a second vault would read, and overwrite, the first one's
// Google sign-in. So each vault keeps its secrets under ids of its own, ending in a scope
// kept in the vault's local storage (per vault and per device, never synced or exported).

const SCOPE_KEY = 'drive-bridge-secret-scope';
export const LEGACY_REFRESH_TOKEN_ID = 'drive-bridge-gdrive-refresh-token';
export const LEGACY_CLIENT_SECRET_ID = 'drive-bridge-gdrive-client-secret';

export type SecretIds = { refreshToken: string; clientSecret: string };

type LocalStorage = {
	loadLocalStorage: (key: string) => unknown;
	saveLocalStorage: (key: string, value: unknown) => void;
};

/** This vault's scope on this device, made once. Lowercase letters and digits only. */
export function secretScope(app: LocalStorage): string {
	const saved = app.loadLocalStorage(SCOPE_KEY);
	if (typeof saved === 'string' && /^[a-z0-9]{8,}$/u.test(saved)) return saved;
	const scope = [...crypto.getRandomValues(new Uint8Array(6))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	app.saveLocalStorage(SCOPE_KEY, scope);
	return scope;
}

export function secretIds(scope: string): SecretIds {
	return {
		clientSecret: `${LEGACY_CLIENT_SECRET_ID}-${scope}`,
		refreshToken: `${LEGACY_REFRESH_TOKEN_ID}-${scope}`,
	};
}

/**
 * Before scoped ids, a vault kept its secrets under the shared ids. A vault that was
 * connected (it knows its Google account) copies them once, so nobody signs in again.
 * The shared ones stay: another vault on this device may still need them. A vault that
 * was never connected copies nothing, so it no longer shows another vault's account.
 */
export function adoptLegacySecrets(storage: SecretStorage, ids: SecretIds, connected: boolean) {
	if (!connected) return;
	for (const [id, legacy] of [
		[ids.refreshToken, LEGACY_REFRESH_TOKEN_ID],
		[ids.clientSecret, LEGACY_CLIENT_SECRET_ID],
	] as const) {
		const value = storage.getSecret(legacy);
		if (value && !storage.getSecret(id)) storage.setSecret(id, value);
	}
}
