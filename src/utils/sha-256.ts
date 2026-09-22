const encoder = new TextEncoder();

export default async function sha256(input: string): Promise<string> {
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hex = '0123456789abcdef';
	const lookup = Array.from({ length: 256 }, (_, i) => hex[i >> 4] + hex[i & 0xf]);
	const view = new DataView(hashBuffer);
	let output = '';
	for (let i = 0; i < 32; i++) output += lookup[view.getUint8(i)];
	return output;
}
