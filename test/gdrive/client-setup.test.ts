import { expect, test } from 'bun:test';
import { isClientId, parseClientJson, SETUP_STEPS } from '@/gdrive/client-setup';

test('recognises a Google client ID', () => {
	expect(isClientId('772940735131-ob46mido9gi6gtbnu9hv9ikefp5.apps.googleusercontent.com')).toBe(
		true,
	);
	expect(isClientId(' 1-abc.apps.googleusercontent.com ')).toBe(true);
	expect(isClientId('my-client')).toBe(false);
	expect(isClientId('GOCSPX-secret')).toBe(false);
});

test('reads the downloaded client_secret.json for a Desktop client', () => {
	const json = JSON.stringify({
		installed: {
			auth_uri: 'https://accounts.google.com/o/oauth2/auth',
			client_id: '1-abc.apps.googleusercontent.com',
			client_secret: 'GOCSPX-secret',
			redirect_uris: ['http://localhost'],
		},
	});
	expect(parseClientJson(json)).toStrictEqual({
		clientId: '1-abc.apps.googleusercontent.com',
		clientSecret: 'GOCSPX-secret',
	});
	expect(
		parseClientJson(JSON.stringify({ web: { client_id: 'a', client_secret: 'b' } })),
	).toStrictEqual({
		clientId: 'a',
		clientSecret: 'b',
	});
	expect(parseClientJson('1-abc.apps.googleusercontent.com')).toBeUndefined();
	expect(parseClientJson('{"installed":{"client_id":"a"}}')).toBeUndefined();
});

test('every setup step opens a Google Cloud Console page', () => {
	for (const { url } of SETUP_STEPS) expect(new URL(url).host).toBe('console.cloud.google.com');
});
