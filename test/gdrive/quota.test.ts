import { expect, test } from 'bun:test';
import { fetchQuota, formatBytes, isNearlyFull } from '@/gdrive/quota';

const GB = 1024 ** 3;
const respond = (status: number, json: unknown) =>
	(() => Promise.resolve({ json: () => json, status })) as never;

test('reads the quota from Drive, with or without a limit', async () => {
	expect(
		await fetchQuota(respond(200, { storageQuota: { limit: String(15 * GB), usage: '1024' } })),
	).toStrictEqual({ limit: 15 * GB, used: 1024 });
	expect(await fetchQuota(respond(200, { storageQuota: { usage: '5' } }))).toStrictEqual({
		limit: undefined,
		used: 5,
	});
});

test('no answer, or no usage, is no quota', async () => {
	expect(await fetchQuota(respond(403, {}))).toBeUndefined();
	expect(await fetchQuota(respond(200, {}))).toBeUndefined();
	expect(
		await fetchQuota(respond(200, { storageQuota: { limit: 'x', usage: '1' } })),
	).toStrictEqual({
		limit: undefined,
		used: 1,
	});
});

test('nearly full: over 95% used, or under 200 MB left; unlimited never', () => {
	expect(isNearlyFull({ limit: 15 * GB, used: 14.3 * GB })).toBe(true);
	expect(isNearlyFull({ limit: 15 * GB, used: 10 * GB })).toBe(false);
	// A large plan with little room left in bytes.
	expect(isNearlyFull({ limit: 2048 * GB, used: 2048 * GB - 100 * 1024 ** 2 })).toBe(true);
	expect(isNearlyFull({ used: 999 * GB })).toBe(false);
});

test('sizes read like Google shows them', () => {
	expect(formatBytes(15 * GB)).toBe('15 GB');
	expect(formatBytes(14.63 * GB)).toBe('14.6 GB');
	expect(formatBytes(512)).toBe('512 B');
	expect(formatBytes(150 * 1024 ** 2)).toBe('150 MB');
	expect(formatBytes(3 * 1024 ** 5)).toBe('3072 TB');
});
