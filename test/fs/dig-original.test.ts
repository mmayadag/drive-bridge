import { expect, test } from 'bun:test';
import digOriginal from '@/fs/dig-original';

test('unwraps every layer down to the file system itself', () => {
	const inner = { name: 'vault' };
	const wrapped = { original: { original: inner } };
	expect(digOriginal(wrapped as never)).toBe(inner as never);
	expect(digOriginal(inner as never)).toBe(inner as never);
});
