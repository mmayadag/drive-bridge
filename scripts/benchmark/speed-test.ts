// oxlint-disable no-console unicorn/require-module-specifiers
const url = '';
const headers: Record<string, string> = {};

const SIZE_BYTES = 50 * 1024 * 1024;
const chunks: Array<Uint8Array<ArrayBuffer>> = [];
for (let remaining = SIZE_BYTES; remaining > 0; remaining -= 65_536) {
	const chunk = new Uint8Array(Math.min(65_536, remaining));
	crypto.getRandomValues(chunk);
	chunks.push(chunk);
}
const payload = new Blob(chunks);

const postStart = performance.now();
const postRes = await fetch(url, { body: payload, headers, method: 'PUT' });
if (!postRes.ok) throw new Error(`PUT ${postRes.status}`);
await postRes.arrayBuffer();
const uploadSpeed = SIZE_BYTES / ((performance.now() - postStart) / 1000);

const getStart = performance.now();
const getRes = await fetch(url, { headers, method: 'GET' });
if (!getRes.ok) throw new Error(`GET ${getRes.status}`);
const downloaded = await getRes.arrayBuffer();
const downloadSpeed = downloaded.byteLength / ((performance.now() - getStart) / 1000);

const delRes = await fetch(url, { headers, method: 'DELETE' });
if (!delRes.ok && delRes.status !== 204 && delRes.status !== 404)
	throw new Error(`DELETE ${delRes.status}`);

console.log(`Upload:   ${(uploadSpeed / 1_048_576).toFixed(2)} MiB/s`);
console.log(`Download: ${(downloadSpeed / 1_048_576).toFixed(2)} MiB/s`);

export {};
