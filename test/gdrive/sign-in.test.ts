import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam } from '@/modules/registrar';

let response: { json: unknown; status: number } = { json: {}, status: 200 };
const requests: Array<RequestParam & { url: string }> = [];
void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam & { url: string }) => {
		requests.push(params);
		return Promise.resolve(response);
	},
}));

const { REDIRECT_URI, codeChallenge, exchangeCode, parseRedirect, startSignIn } =
	await import('@/gdrive/sign-in');

test('the code challenge matches the RFC 7636 example', async () => {
	expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
		'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
	);
});

test('the consent address asks for an offline, full Drive grant with PKCE', async () => {
	const pending = await startSignIn('my-client');
	const url = new URL(pending.url);
	expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
	const params = Object.fromEntries(url.searchParams);
	expect(params).toMatchObject({
		access_type: 'offline',
		client_id: 'my-client',
		code_challenge: await codeChallenge(pending.verifier),
		code_challenge_method: 'S256',
		prompt: 'consent',
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/drive',
		state: pending.state,
	});
	expect(pending.verifier.length).toBeGreaterThanOrEqual(43);
});

test('reads the pasted address', () => {
	const address = `${REDIRECT_URI}/?state=s1&code=4/0AX&scope=drive`;
	expect(parseRedirect(address, 's1')).toStrictEqual({ code: '4/0AX', status: 'code' });
	expect(parseRedirect(address, 'other')).toStrictEqual({ status: 'stateMismatch' });
	expect(parseRedirect(address)).toStrictEqual({ status: 'stateMismatch' });
	expect(parseRedirect(`${REDIRECT_URI}/?state=s1&error=access_denied`, 's1')).toStrictEqual({
		status: 'denied',
	});
	// Tokens and other text are not addresses.
	expect(parseRedirect('1//0gabc', 's1')).toBeUndefined();
	expect(parseRedirect('eyJ0b2tlbiI6MX0', 's1')).toBeUndefined();
	expect(parseRedirect('https://example.com/page', 's1')).toBeUndefined();
});

test('trades the code for a refresh token with the verifier', async () => {
	response = { json: { access_token: 'a', refresh_token: '1//refresh' }, status: 200 };
	const token = await exchangeCode({
		clientId: 'id',
		clientSecret: 'secret',
		code: 'the-code',
		verifier: 'the-verifier',
	});
	expect(token).toBe('1//refresh');
	const body = Object.fromEntries(new URLSearchParams(String(requests.at(-1)?.body)));
	expect(requests.at(-1)?.url).toBe('https://oauth2.googleapis.com/token');
	expect(body).toStrictEqual({
		client_id: 'id',
		client_secret: 'secret',
		code: 'the-code',
		code_verifier: 'the-verifier',
		grant_type: 'authorization_code',
		redirect_uri: REDIRECT_URI,
	});
});

test('reports Google errors', async () => {
	response = { json: { error: 'invalid_grant', error_description: 'Bad code' }, status: 400 };
	const failure = await exchangeCode({
		clientId: 'id',
		clientSecret: 's',
		code: 'c',
		verifier: 'v',
	})
		.then(() => {})
		.catch((error: unknown) => error);
	expect(failure).toBeInstanceOf(Error);
	expect((failure as Error).message).toBe('Bad code');
});
