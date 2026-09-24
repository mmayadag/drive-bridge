import { requestUrl } from 'obsidian';
import { OAUTH_TOKEN_URL } from './api';

// Google's authorization code flow for installed apps, with PKCE. Nothing listens on the
// loopback address: the browser fails to load it, and the user pastes the address, which
// carries the code, back into the plugin. That works the same on desktop and mobile.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export const REDIRECT_URI = 'http://127.0.0.1:53682';

/** A sign-in in progress; kept in memory only, until the address is pasted back. */
export type PendingSignIn = { url: string; verifier: string; state: string };

function base64Url(bytes: Uint8Array) {
	let text = '';
	for (const byte of bytes) text += String.fromCodePoint(byte);
	return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/[=]+$/u, '');
}

function randomString(byteCount: number) {
	return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

/** The S256 code challenge for a PKCE code verifier (RFC 7636). */
export async function codeChallenge(verifier: string) {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64Url(new Uint8Array(hash));
}

export async function startSignIn(clientId: string): Promise<PendingSignIn> {
	const verifier = randomString(48);
	const state = randomString(16);
	const params = new URLSearchParams({
		access_type: 'offline',
		client_id: clientId,
		code_challenge: await codeChallenge(verifier),
		code_challenge_method: 'S256',
		prompt: 'consent',
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: DRIVE_SCOPE,
		state,
	});
	return { state, url: `${AUTH_URL}?${params.toString()}`, verifier };
}

export type Redirect =
	| { status: 'code'; code: string }
	| { status: 'denied' }
	| { status: 'stateMismatch' };

/**
 * Reads the address the browser ended on after the consent page. Undefined when the text
 * is not such an address, so it can be treated as a pasted token instead.
 */
export function parseRedirect(input: string, expectedState?: string): Redirect | undefined {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return undefined;
	}
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	if (!code && !error) return undefined;
	if (!expectedState || url.searchParams.get('state') !== expectedState)
		return { status: 'stateMismatch' };
	if (error || !code) return { status: 'denied' };
	return { code, status: 'code' };
}

type CodeResponse = { refresh_token?: string; error?: string; error_description?: string };

/** Trades the authorization code for a refresh token. */
export async function exchangeCode(input: {
	clientId: string;
	clientSecret: string;
	code: string;
	verifier: string;
}): Promise<string> {
	const response = await requestUrl({
		body: new URLSearchParams({
			client_id: input.clientId,
			client_secret: input.clientSecret,
			code: input.code,
			code_verifier: input.verifier,
			grant_type: 'authorization_code',
			redirect_uri: REDIRECT_URI,
		}).toString(),
		contentType: 'application/x-www-form-urlencoded',
		method: 'POST',
		throw: false,
		url: OAUTH_TOKEN_URL,
	});
	const data = response.json as CodeResponse;
	if (data.refresh_token) return data.refresh_token;
	throw new Error(
		data.error_description ??
			data.error ??
			(response.status === 200
				? 'Google returned no refresh token.'
				: `HTTP ${response.status}`),
	);
}
