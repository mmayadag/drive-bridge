import { expect, test } from 'bun:test';
import { open, seal, WrongPassphraseError } from '@/shared/secret-box';

const failure = (promise: Promise<unknown>) =>
	promise.then(() => {}).catch((error: unknown) => error);

test('round trip with the right passphrase', async () => {
	const sealed = await seal('{"refreshToken":"1//abc"}', 'correct horse');
	expect(sealed.startsWith('drive-bridge:v1:')).toBe(true);
	expect(sealed).not.toContain('abc');
	expect(await open(sealed, 'correct horse')).toBe('{"refreshToken":"1//abc"}');
});

test('each seal uses a fresh salt and iv', async () => {
	expect(await seal('same', 'pass')).not.toBe(await seal('same', 'pass'));
});

test('a wrong passphrase or a changed blob is rejected', async () => {
	const sealed = await seal('secret', 'right');
	expect(await failure(open(sealed, 'wrong'))).toBeInstanceOf(WrongPassphraseError);
	// Flip one ciphertext byte; changing the last base64 character can hit padding bits only.
	const prefix = 'drive-bridge:v1:';
	const bytes = Uint8Array.from(
		atob(sealed.slice(prefix.length)),
		(char) => char.codePointAt(0) ?? 0,
	);
	bytes[bytes.length - 5] ^= 1;
	const tampered = prefix + btoa(String.fromCodePoint(...bytes));
	expect(await failure(open(tampered, 'right'))).toBeInstanceOf(WrongPassphraseError);
	expect(await failure(open('not a secret', 'right'))).toBeInstanceOf(WrongPassphraseError);
});
