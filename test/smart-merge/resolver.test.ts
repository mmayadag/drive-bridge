import testKit from '$/support/test-kit';
import { beforeEach, expect, test } from 'bun:test';
import type { RecordStore } from '@/modules/storage';
import type { DatabaseAsync } from '@/shared/key-value-store';
import type { SmartMergeDatabase } from '@/smart-merge/index';
import type { MergeOptions } from '@/smart-merge/utils/merge';
import type { RecordStat } from '@/types';
import { uint8ArrayToText } from '@/shared/binary';
import { openMemoryDB } from '@/shared/key-value-store';
import smartMergeResolver from '@/smart-merge/resolver';

const { bytes, file, fs, stream } = testKit;
const memoryDB: DatabaseAsync<{ record: RecordStat }> = openMemoryDB(
	'smart-merge-resolver-test',
) as never;

const mergeOptions: MergeOptions = {
	conflictAEnd: '</a>',
	conflictAStart: '<a>',
	conflictBEnd: '</b>',
	conflictBStart: '<b>',
	deletionEnd: '</del>',
	deletionStart: '<del>',
};

let db: SmartMergeDatabase;
let record: RecordStore;

beforeEach(() => {
	void memoryDB.clearStores();
	db = memoryDB;
	record = memoryDB.getStore('record');
});

test('resolver should merge when base text exists', async () => {
	const local = fs({ control: { read: () => bytes('line1-local\nline2\nline3') } });
	const remote = fs({ control: { read: () => bytes('line1\nline2\nline3-remote') } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');
	await db.getStore('base-text-namespace').set('note.md', 'line1\nline2\nline3');

	await resolver({
		key: 'note.md',
		local: file('note.md', { mtime: 2, uid: 'local-old' }),
		localFs: local.fs,
		record,
		remote: file('note.md', { mtime: 3, uid: 'remote-old' }),
		remoteFs: remote.fs,
	});

	expect(uint8ArrayToText(remote.calls.write[0]?.[1])).toBe('line1-local\nline2\nline3-remote');
	expect(uint8ArrayToText(local.calls.write[0]?.[1])).toBe('line1-local\nline2\nline3-remote');
	expect(await record.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'write-uid',
		remote: 'write-uid',
	});
});

test('resolver just re-records when both sides already match, even with a base', async () => {
	const local = fs({ control: { read: () => bytes('same text') } });
	const remote = fs({ control: { read: () => bytes('same text') } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');
	await db.getStore('base-text-namespace').set('note.md', 'same text');

	await resolver({
		key: 'note.md',
		local: file('note.md', { mtime: 2, uid: 'local-1' }),
		localFs: local.fs,
		record,
		remote: file('note.md', { mtime: 3, uid: 'remote-1' }),
		remoteFs: remote.fs,
	});

	expect(local.calls.write).toHaveLength(0);
	expect(remote.calls.write).toHaveLength(0);
	expect(await record.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-1',
		remote: 'remote-1',
	});
});

test('resolver keeps both versions when base text is missing', async () => {
	const local = fs({ control: { read: () => bytes('local version') } });
	const remote = fs({ control: { read: () => bytes('remote version') } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');

	await resolver({
		key: 'note.md',
		local: file('note.md', { mtime: 10, uid: 'local-current' }),
		localFs: local.fs,
		record,
		remote: file('note.md', { mtime: 3, uid: 'remote-old' }),
		remoteFs: remote.fs,
	});

	// The newer local text becomes note.md everywhere; the remote text survives as a copy.
	expect(remote.calls.move).toStrictEqual([['note.md', 'note.conflict.md']]);
	expect(uint8ArrayToText(remote.calls.write[0]?.[1])).toBe('local version');
	expect(local.calls.write[0]?.[0]).toBe('note.conflict.md');
	expect(uint8ArrayToText(local.calls.write[0]?.[1])).toBe('remote version');
});

test('resolver should stream remote fallback for large newer remote files', async () => {
	const local = fs();
	const remote = fs({ control: { readStream: () => stream(['remote wins']) } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');
	const remoteStat = file('large.md', { mtime: 10, size: 6 * 1024 ** 2, uid: 'remote-current' });

	await resolver({
		key: 'large.md',
		local: file('large.md', { mtime: 1, uid: 'local-old' }),
		localFs: local.fs,
		record,
		remote: remoteStat,
		remoteFs: remote.fs,
	});

	expect(remote.calls.readStream).toStrictEqual([['large.md', remoteStat]]);
	expect(local.calls.writeStream).toStrictEqual([['large.md', remoteStat]]);
	expect(await record.get('large.md')).toStrictEqual({
		isDir: false,
		local: 'stream-uid',
		remote: 'remote-current',
	});
});
