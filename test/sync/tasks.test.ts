// What each sync task does to the two file systems and to the record of the last sync.
// The decider picks the tasks; these are the ones that actually move data.

import testKit from '$/support/test-kit';
import { beforeEach, expect, test } from 'bun:test';
import type { RecordStore } from '@/modules/storage';
import type { RecordStat } from '@/types';
import AddRecord from '@/sync/tasks/add-record';
import CreateLocalDir from '@/sync/tasks/create-local-dir';
import CreateRemoteDir from '@/sync/tasks/create-remote-dir';
import Download from '@/sync/tasks/download';
import MoveLocal from '@/sync/tasks/move-local';
import MoveRemote from '@/sync/tasks/move-remote';
import RemoveLocal from '@/sync/tasks/remove-local';
import RemoveRecord from '@/sync/tasks/remove-record';
import RemoveRemote from '@/sync/tasks/remove-remote';
import ResolveConflict from '@/sync/tasks/resolve-conflict';
import Upload from '@/sync/tasks/upload';

const { bytes, file, folder, fs } = testKit;

function recordStore() {
	const values = new Map<string, RecordStat>();
	const store = {
		batch: (operations: Array<{ type: string; key: string; value?: RecordStat }>) => {
			for (const operation of operations)
				if (operation.type === 'delete') values.delete(operation.key);
				else if (operation.value) values.set(operation.key, operation.value);
			return Promise.resolve([]);
		},
		delete: (key: string) => Promise.resolve(void values.delete(key)),
		get: (key: string) => Promise.resolve(values.get(key)),
		set: (key: string, value: RecordStat) => Promise.resolve(void values.set(key, value)),
	};
	return { store: store as unknown as RecordStore, values };
}

let local: ReturnType<typeof fs>;
let remote: ReturnType<typeof fs>;
let record: ReturnType<typeof recordStore>;

function base() {
	return { localFs: local.fs, record: record.store, remoteFs: remote.fs };
}

beforeEach(() => {
	local = fs({ control: { read: () => bytes('local text') } });
	remote = fs({ control: { read: () => bytes('remote text') } });
	record = recordStore();
});

test('upload copies the local file out and records both sides', async () => {
	const stat = file('note.md', { uid: 'local-1' });
	await new Upload({ ...base(), key: 'note.md', local: stat }).exec();

	expect(remote.calls.write[0]?.[0]).toBe('note.md');
	expect(local.calls.read[0]?.[0]).toBe('note.md');
	expect(record.values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-1',
		remote: 'write-uid',
	});
});

test('download copies the remote file in and records both sides', async () => {
	const stat = file('note.md', { uid: 'remote-1' });
	await new Download({ ...base(), key: 'note.md', remote: stat }).exec();

	expect(local.calls.write[0]?.[0]).toBe('note.md');
	expect(record.values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'write-uid',
		remote: 'remote-1',
	});
});

test('a file that disappeared before it could be read leaves no record', async () => {
	local = fs({
		control: {
			read: () => {
				const error = new Error('not found') as Error & { status: number };
				error.status = 404;
				throw error;
			},
		},
	});
	await new Upload({ ...base(), key: 'gone.md', local: file('gone.md') }).exec();

	expect(remote.calls.write).toHaveLength(0);
	expect(record.values.has('gone.md')).toBe(false);
});

test('removing a file locally also forgets it', async () => {
	await record.store.set('note.md', { isDir: false, local: 'a', remote: 'b' });
	await new RemoveLocal({ ...base(), key: 'note.md', local: file('note.md') }).exec();

	expect(local.calls.delete).toStrictEqual(['note.md']);
	expect(remote.calls.delete).toHaveLength(0);
	expect(record.values.has('note.md')).toBe(false);
});

test('removing a file remotely also forgets it', async () => {
	await record.store.set('note.md', { isDir: false, local: 'a', remote: 'b' });
	await new RemoveRemote({ ...base(), key: 'note.md', remote: file('note.md') }).exec();

	expect(remote.calls.delete).toStrictEqual(['note.md']);
	expect(local.calls.delete).toHaveLength(0);
	expect(record.values.has('note.md')).toBe(false);
});

test('removing only the record touches neither side', async () => {
	await record.store.set('note.md', { isDir: false, local: 'a', remote: 'b' });
	await new RemoveRecord({ ...base(), key: 'note.md' }).exec();

	expect(record.values.has('note.md')).toBe(false);
	expect(local.calls.delete).toHaveLength(0);
	expect(remote.calls.delete).toHaveLength(0);
});

test('adding a record keeps both uids for a file and just the folder flag for a folder', async () => {
	await new AddRecord({
		...base(),
		key: 'note.md',
		local: file('note.md', { uid: 'local-1' }),
		remote: file('note.md', { uid: 'remote-1' }),
	}).exec();
	await new AddRecord({
		...base(),
		key: 'dir/',
		local: folder('dir/'),
		remote: folder('dir/'),
	}).exec();

	expect(record.values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-1',
		remote: 'remote-1',
	});
	expect(record.values.get('dir/')).toStrictEqual({ isDir: true });
});

test('creating a folder on either side records it', async () => {
	await new CreateLocalDir({ ...base(), key: 'dir/', remote: folder('dir/') }).exec();
	await new CreateRemoteDir({ ...base(), key: 'other/', local: folder('other/') }).exec();

	expect(local.calls.mkdir).toStrictEqual(['dir/']);
	expect(remote.calls.mkdir).toStrictEqual(['other/']);
	expect(record.values.get('dir/')).toStrictEqual({ isDir: true });
	expect(record.values.get('other/')).toStrictEqual({ isDir: true });
});

test('a move carries the record over to the new name', async () => {
	await record.store.set('old.md', { isDir: false, local: 'a', remote: 'b' });
	await new MoveLocal({
		...base(),
		key: 'new.md',
		oldKey: 'old.md',
		remote: file('new.md'),
	}).exec();

	expect(local.calls.move).toStrictEqual([['old.md', 'new.md']]);
	expect(record.values.get('new.md')).toStrictEqual({ isDir: false, local: 'a', remote: 'b' });
	expect(record.values.has('old.md')).toBe(false);
});

test('a remote move does the same on the other side', async () => {
	await record.store.set('old.md', { isDir: false, local: 'a', remote: 'b' });
	await new MoveRemote({
		...base(),
		key: 'new.md',
		local: file('new.md'),
		oldKey: 'old.md',
	}).exec();

	expect(remote.calls.move).toStrictEqual([['old.md', 'new.md']]);
	expect(record.values.get('new.md')).toStrictEqual({ isDir: false, local: 'a', remote: 'b' });
});

test('a move of something that was never recorded records nothing', async () => {
	await new MoveLocal({
		...base(),
		key: 'new.md',
		oldKey: 'unknown.md',
		remote: file('new.md'),
	}).exec();

	expect(local.calls.move).toStrictEqual([['unknown.md', 'new.md']]);
	expect(record.values.size).toBe(0);
});

test('a conflict hands both versions to the chosen resolver', async () => {
	const seen: Array<Record<string, unknown>> = [];
	const localStat = file('note.md', { uid: 'local-1' });
	const remoteStat = file('note.md', { uid: 'remote-1' });

	await new ResolveConflict({
		...base(),
		key: 'note.md',
		local: localStat,
		remote: remoteStat,
		resolver: (payload) => void seen.push(payload),
	}).exec();

	expect(seen).toHaveLength(1);
	expect(seen[0]).toMatchObject({ key: 'note.md', local: localStat, remote: remoteStat });
	// The task itself writes nothing; the resolver decides what happens.
	expect(record.values.size).toBe(0);
	expect(local.calls.write).toHaveLength(0);
	expect(remote.calls.write).toHaveLength(0);
});
