import type { SecretStorage } from 'obsidian';
import { requestUrl } from 'obsidian';
import type { Request } from '@/sdk';
import { getStatus } from '@/shared/error';
import { buildUrl, DRIVE_API, OAUTH_TOKEN_URL } from './api';

// Secret storage ids. Secret storage is per device and never synced.
const REFRESH_TOKEN_ID = 'drive-bridge-gdrive-refresh-token';
const CLIENT_SECRET_ID = 'drive-bridge-gdrive-client-secret';

/** The user's own Google Cloud OAuth client. Nothing is compiled into the plugin. */
export type ClientCredentials = { clientId: string; clientSecret: string };

type TokenResponse = {
	access_token: string;
	expires_in: number;
	scope?: string;
};

const FULL_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

type TokenError = {
	error:
		| 'invalid_request'
		| 'invalid_client'
		| 'invalid_grant'
		| 'unauthorized_client'
		| 'unsupported_grant_type'
		| 'access_denied';
	error_description?: string;
};

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

function formEncode(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}

function describeAuthError(data: TokenError, status: number): string {
	return data.error_description ?? data.error ?? `HTTP ${status}`;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function decodeBase64Url(text: string): string | undefined {
	try {
		return atob(text.replaceAll('-', '+').replaceAll('_', '/'));
	} catch {
		return undefined;
	}
}

function refreshTokenFromJson(value: unknown): string | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const { refresh_token, token } = value as { refresh_token?: unknown; token?: unknown };
	if (typeof refresh_token === 'string' && refresh_token) return refresh_token;
	// Recent rclone versions wrap the token JSON as a string under `token`.
	if (typeof token === 'string') return refreshTokenFromJson(parseJson(token));
	return undefined;
}

/**
 * Accepts a bare refresh token or what `rclone authorize` prints: a JSON token object,
 * optionally prefixed with `token =` from rclone.conf, or the base64 block that recent
 * rclone versions print instead (it starts with `eyJ`, which is `{"` encoded).
 */
export function parseRefreshToken(input: string): string | undefined {
	const text = input.trim().replace(/^token\s*=\s*/u, '');
	if (!text) return undefined;
	if (text.startsWith('{')) return refreshTokenFromJson(parseJson(text));
	if (text.startsWith('eyJ')) {
		const decoded = decodeBase64Url(text);
		return decoded ? refreshTokenFromJson(parseJson(decoded)) : undefined;
	}
	return /^[\w./~+-]+$/u.test(text) ? text : undefined;
}

export type Account = { userId: string; email: string };

/** Reads the signed-in Google user. `userId` is stable and keeps sync records per account. */
export async function fetchAccount(accessToken: string): Promise<Account> {
	const response = await requestUrl({
		headers: { Authorization: `Bearer ${accessToken}` },
		method: 'GET',
		throw: false,
		url: buildUrl(DRIVE_API, '/about', { fields: 'user(permissionId,emailAddress)' }),
	});
	const user = (response.json as { user?: { permissionId?: string; emailAddress?: string } })
		?.user;
	if (response.status >= 300 || !user?.permissionId)
		throw new Error(`Could not read the Google account: HTTP ${response.status}`);
	return { email: user.emailAddress ?? '', userId: user.permissionId };
}

/**
 * Caches the short-lived access token and refreshes it with the stored refresh
 * token when needed. One instance is shared by the request middleware and the
 * connection check so a token refresh happens at most once at a time.
 */
export class TokenManager {
	private accessToken?: string;
	private expiresAt = 0;
	private grantedScopes: Array<string> = [];
	private pending?: Promise<string>;

	constructor(
		private readonly secretStorage: SecretStorage,
		private readonly getClientId: () => string,
	) {}

	readonly getCredentials = (): ClientCredentials => ({
		clientId: this.getClientId(),
		clientSecret: this.secretStorage.getSecret(CLIENT_SECRET_ID) ?? '',
	});

	readonly hasCredentials = () => {
		const { clientId, clientSecret } = this.getCredentials();
		return Boolean(clientId && clientSecret);
	};

	readonly setClientSecret = (secret: string) =>
		secret
			? this.secretStorage.setSecret(CLIENT_SECRET_ID, secret)
			: this.secretStorage.deleteSecret(CLIENT_SECRET_ID);

	readonly getToken = (force = false): Promise<string> => {
		if (!force && this.accessToken && Date.now() < this.expiresAt - 60_000)
			return Promise.resolve(this.accessToken);
		this.pending ??= this.refresh().finally(() => (this.pending = undefined));
		return this.pending;
	};

	readonly getRefreshToken = () => this.secretStorage.getSecret(REFRESH_TOKEN_ID);

	readonly setRefreshToken = (token: string) =>
		this.secretStorage.setSecret(REFRESH_TOKEN_ID, token);

	readonly deleteRefreshToken = () => this.secretStorage.deleteSecret(REFRESH_TOKEN_ID);

	/** Whether the last refresh granted full Drive access rather than just drive.file. */
	readonly hasFullDriveScope = () => this.grantedScopes.includes(FULL_DRIVE_SCOPE);

	readonly invalidate = (): void => {
		this.accessToken = undefined;
		this.expiresAt = 0;
	};

	private async refresh(): Promise<string> {
		const refresh_token = this.getRefreshToken();
		if (!refresh_token) throw new Error('Please authorize Google Account!');
		const { clientId, clientSecret } = this.getCredentials();
		if (!clientId || !clientSecret)
			throw new Error('Enter the OAuth client ID and client secret in the settings.');
		const response = await requestUrl({
			body: formEncode({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'refresh_token',
				refresh_token,
			}),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			throw: false,
			url: OAUTH_TOKEN_URL,
		});
		const data = response.json as TokenResponse | TokenError;
		if ('access_token' in data) {
			this.accessToken = data.access_token;
			this.expiresAt = Date.now() + data.expires_in * 1000;
			this.grantedScopes = data.scope?.split(' ') ?? [];
			return data.access_token;
		}
		this.invalidate();
		if (data.error === 'invalid_grant')
			throw new Error(
				'Google Drive authorization expired or was revoked, please reconnect your Google account in the settings.',
			);
		throw new Error(
			`Google Drive token refresh failed: ${describeAuthError(data, response.status)}`,
		);
	}
}

/** Injects the bearer token into every remote request and retries once on 401. */
export function bearerMiddleware(request: Request, manager: TokenManager): Request {
	return async (url, params) => {
		const send = (token: string) =>
			request(url, {
				...params,
				headers: { ...params?.headers, Authorization: `Bearer ${token}` },
			});
		try {
			return await send(await manager.getToken());
		} catch (error: unknown) {
			if (getStatus(error) !== 401) throw error;
			manager.invalidate();
			return send(await manager.getToken(true));
		}
	};
}
