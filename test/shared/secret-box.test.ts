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
	const last = sealed.at(-2) === 'A' ? 'B' : 'A';
	const tampered = `${sealed.slice(0, -2)}${last}${sealed.at(-1)}`;
	expect(await failure(open(tampered, 'right'))).toBeInstanceOf(WrongPassphraseError);
	expect(await failure(open('not a secret', 'right'))).toBeInstanceOf(WrongPassphraseError);
});
