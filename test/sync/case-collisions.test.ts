import { expect, test } from 'bun:test';
import type { RecordStat, Stat } from '@/types';
import { foldName, leaveOutCaseCollisions } from '@/sync/case-collisions';

const stats = (...keys: Array<string>) =>
	new Map(keys.map((key) => [key, { isDir: key.endsWith('/'), key } as Stat]));
const records = (...keys: Array<string>) => new Map(keys.map((key) => [key, {} as RecordStat]));

test('nothing changes when no two Drive names fold together', () => {
	const maps = {
		localStats: stats('a.md', 'b.md'),
		records: records('a.md'),
		remoteStats: stats('a.md', 'B.md'),
	};
	expect(leaveOutCaseCollisions(maps)).toStrictEqual([]);
	expect([...maps.remoteStats.keys()]).toStrictEqual(['a.md', 'B.md']);
	expect([...maps.localStats.keys()]).toStrictEqual(['a.md', 'b.md']);
});

test('two Drive files that differ only in case leave the sync on every side', () => {
	const maps = {
		localStats: stats('notes/', 'notes/Note.md', 'other.md'),
		records: records('notes/', 'notes/Note.md', 'other.md'),
		remoteStats: stats('notes/', 'notes/Note.md', 'notes/note.md', 'other.md'),
	};
	expect(leaveOutCaseCollisions(maps)).toStrictEqual([['notes/Note.md', 'notes/note.md']]);
	// Gone from all three, so the plan has no download over it and no deletion of it.
	for (const map of [maps.localStats, maps.remoteStats, maps.records])
		expect([...map.keys()]).toStrictEqual(['notes/', 'other.md']);
});

test('a colliding folder takes everything under it out, and is reported once', () => {
	const maps = {
		localStats: stats('Docs/', 'Docs/a.md'),
		records: records('Docs/', 'Docs/a.md'),
		remoteStats: stats('Docs/', 'Docs/a.md', 'docs/', 'docs/a.md', 'keep.md'),
	};
	expect(leaveOutCaseCollisions(maps)).toStrictEqual([['Docs/', 'docs/']]);
	expect([...maps.remoteStats.keys()]).toStrictEqual(['keep.md']);
	expect(maps.localStats.size).toBe(0);
	expect(maps.records.size).toBe(0);
});

test('a file and a folder whose names fold together collide too', () => {
	const maps = { localStats: stats(), records: records(), remoteStats: stats('Plan', 'plan/') };
	expect(leaveOutCaseCollisions(maps)).toStrictEqual([['Plan', 'plan/']]);
});

test('NFC and NFD spellings of one name collide', () => {
	const nfc = 'café.md';
	const nfd = 'café.md';
	const maps = { localStats: stats(), records: records(), remoteStats: stats(nfc, nfd) };
	expect(leaveOutCaseCollisions(maps)).toHaveLength(1);
	expect(maps.remoteStats.size).toBe(0);
});

test('Turkish I and i fold together, the way file systems treat them', () => {
	// A Turkish-locale fold would keep these apart and let one overwrite the other.
	expect(foldName('I.md')).toBe(foldName('i.md'));
	expect(foldName('ı.md')).toBe(foldName('I.md'));
	expect(foldName('İ.md')).not.toBe(foldName('I.md'));
	expect(foldName('şçğ.md')).toBe(foldName('ŞÇĞ.md'));
});
