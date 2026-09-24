import { expect, test } from 'bun:test';
import hash from '@/shared/crypto';

test('the same input always gives the same hash', () => {
	expect(hash({ a: 1, b: 'x' })).toBe(hash({ a: 1, b: 'x' }));
	// Stored identities depend on this value; a change here breaks existing records.
	expect(hash('')).toBe('ffcaaa85');
});

test('different inputs give different hashes', () => {
	expect(hash('notes/a.md')).not.toBe(hash('notes/b.md'));
	expect(hash([1, 2])).not.toBe(hash([2, 1]));
});

test('the hash is unsigned hex', () => {
	for (const input of ['a', 'ğüşıöç', { deep: { list: [1, 2, 3] } }])
		expect(hash(input)).toMatch(/^[0-9a-f]{1,8}$/u);
});
