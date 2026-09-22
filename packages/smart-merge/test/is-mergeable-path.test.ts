import { expect, test } from 'bun:test';
import isMergeablePath from '@/utils/is-mergeable-path';

test('mergeable path detection should accept markdown extensions', () => {
	expect(isMergeablePath(' note.md ')).toBe(true);
	expect(isMergeablePath('folder/NOTE.MARKDOWN')).toBe(true);
	expect(isMergeablePath('folder/note.txt')).toBe(false);
});
