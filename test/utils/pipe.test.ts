import { expect, test } from 'bun:test';
import { getSizeCaps } from '@/utils/pipe';

const MIB = 1024 ** 2;

test('a roomy device streams above 5 MiB in 4 MiB chunks', () => {
	const caps = getSizeCaps({ deviceMemory: 8, hardwareConcurrency: 2 }, false);
	expect(caps.streamThreshold).toBe(5 * MIB);
	expect(caps.chunkSize).toBe(4 * MIB);
	expect(caps.concurrency).toBeGreaterThan(0);
});

test('low device memory halves the sizes, whatever the core count', () => {
	const caps = getSizeCaps({ deviceMemory: 2, hardwareConcurrency: 16 }, false);
	expect(caps.streamThreshold).toBe(2.5 * MIB);
});

test('without device memory, few cores halve the sizes', () => {
	expect(getSizeCaps({ hardwareConcurrency: 16 }, false).streamThreshold).toBe(5 * MIB);
	expect(getSizeCaps({ hardwareConcurrency: 2 }, false).streamThreshold).toBe(2.5 * MIB);
});

test('the Android app halves the sizes again', () => {
	const caps = getSizeCaps({ deviceMemory: 2, hardwareConcurrency: 2 }, true);
	expect(caps.streamThreshold).toBe(1.25 * MIB);
	expect(caps.chunkSize).toBe(MIB);
});
