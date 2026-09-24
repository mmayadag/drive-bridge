// Passphrase encryption for secrets that leave the device in a settings export.
// PBKDF2-SHA256 derives an AES-GCM key from the passphrase and a random salt; AES-GCM
// both encrypts and detects tampering. Web Crypto only, so it works on phones too.

const PREFIX = 'drive-bridge:v1:';
const ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array) {
	let text = '';
	for (const byte of bytes) text += String.fromCodePoint(byte);
	return btoa(text);
}

function fromBase64(text: string) {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
	return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(passphrase),
		'PBKDF2',
		false,
		['deriveKey'],
	);
	return crypto.subtle.deriveKey(
		{ hash: 'SHA-256', iterations: ITERATIONS, name: 'PBKDF2', salt },
		material,
		{ length: 256, name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt'],
	);
}

/** `drive-bridge:v1:<base64 of salt, iv and ciphertext>`. */
export async function seal(plaintext: string, passphrase: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const key = await deriveKey(passphrase, salt);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ iv, name: 'AES-GCM' },
			key,
			new TextEncoder().encode(plaintext),
		),
	);
	const packed = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length);
	packed.set(salt);
	packed.set(iv, SALT_BYTES);
	packed.set(ciphertext, SALT_BYTES + IV_BYTES);
	return PREFIX + toBase64(packed);
}

export class WrongPassphraseError extends Error {
	override name = 'WrongPassphraseError';
}

/** Reverses `seal`. A wrong passphrase or a changed blob throws `WrongPassphraseError`. */
export async function open(sealed: string, passphrase: string): Promise<string> {
	if (!sealed.startsWith(PREFIX)) throw new WrongPassphraseError('Not a Drive Bridge secret.');
	let packed: Uint8Array;
	try {
		packed = fromBase64(sealed.slice(PREFIX.length));
	} catch {
		throw new WrongPassphraseError('The secret is damaged.');
	}
	const salt = packed.slice(0, SALT_BYTES);
	const iv = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
	const key = await deriveKey(passphrase, salt);
	try {
		const plaintext = await crypto.subtle.decrypt(
			{ iv, name: 'AES-GCM' },
			key,
			packed.slice(SALT_BYTES + IV_BYTES),
		);
		return new TextDecoder().decode(plaintext);
	} catch {
		throw new WrongPassphraseError('Wrong passphrase, or the secret was changed.');
	}
}
