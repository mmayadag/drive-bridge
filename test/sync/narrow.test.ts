import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { RecordStat, Stat } from '@/types';
import { bidirectionalDecider } from '@/sync';
import { keyWithParents, narrowTo } from '@/sync/narrow';

const { file, fileRecord, folder, runDecider } = testKit;

test('lists the file and every folder above it', () => {
	expect([...keyWithParents('a/b/note.md')]).toStrictEqual(['a/b/note.md', 'a/', 'a/b/']);
	expect([...keyWithParents('note.md')]).toStrictEqual(['note.md']);
});

test('a single-file sync plans that file and forgets no other record', () => {
	const localStats = new Map<string, Stat>([
		['a/', folder('a/')],
		['a/note.md', file('a/note.md', { uid: 'changed' })],
		['other.md', file('other.md', { uid: 'o' })],
	]);
	const remoteStats = new Map<string, Stat>([
		['a/', folder('a/')],
		['a/note.md', file('a/note.md', { uid: 'r' })],
	]);
	const records = new Map<string, RecordStat>([
		['a/note.md', fileRecord('old', 'r')],
		['gone.md', fileRecord('g', 'g')],
	]);
	narrowTo('a/note.md', { localStats, records, remoteStats });
	const tasks = runDecider(bidirectionalDecider, { localStats, records, remoteStats });
	const planned = tasks.map((task) => `${task.name} ${task.key}`);
	expect(planned).toContain('upload a/note.md');
	// Nothing touches other files or their records.
	expect(
		planned.filter((line) => !line.endsWith(' a/note.md') && !line.endsWith(' a/')),
	).toStrictEqual([]);
	expect(planned.some((line) => line.startsWith('removeRecord'))).toBe(false);
});
