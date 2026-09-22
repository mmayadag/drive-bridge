export default function hash(input: unknown): string {
	const str = JSON.stringify(input);
	let hashHex = 0x81_1c_9d_c5;
	for (let i = 0; i < str.length; i++) {
		// oxlint-disable-next-line unicorn/prefer-code-point : Keep UTF-16 code-unit hashing stable for existing identities.
		hashHex ^= str.charCodeAt(i);
		hashHex = Math.imul(hashHex, 0x01_00_01_93);
	}
	// oxlint-disable-next-line unicorn/prefer-math-trunc https://github.com/oxc-project/oxc/issues/25239
	return (hashHex >>> 0).toString(16);
}
