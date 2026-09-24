// What each version-replacing conflict strategy copies, and the record it leaves.

import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { RecordStore } from '@/modules/storage';
import type { RecordStat } from '@/types';
import keepLocalResolver from '@/sync/conflict-resolve/keep-local';
import keepRemoteResolver from '@/sync/conflict-resolve/keep-remote';
import latestSurviveResolver from '@/sync/conflict-resolve/latest-survive';

const { bytes, file, fs } = testKit;

function setup(localMtime: number, remoteMtime: number) {
	const values = new Map<string, RecordStat>();
	const record = {
		set: (key: string, value: RecordStat) => Promise.resolve(void values.set(key, value)),
	} as unknown as RecordStore;
	const local = fs({ control: { read: () => bytes('vault text') } });
	const remote = fs({ control: { read: () => bytes('drive text') } });
	return {
		local,
		payload: {
			key: 'note.md',
			local: file('note.md', { mtime: localMtime, uid: 'local-uid' }),
			localFs: local.fs,
			record,
			remote: file('note.md', { mtime: remoteMtime, uid: 'remote-uid' }),
			remoteFs: remote.fs,
		},
		remote,
		values,
	};
}

test('keep local uploads the vault version over Drive', async () => {
	const { local, payload, remote, values } = setup(1, 2);
	await keepLocalResolver(payload);
	expect(remote.calls.write.map(([key]) => key)).toStrictEqual(['note.md']);
	expect(local.calls.write).toStrictEqual([]);
	expect(values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-uid',
		remote: 'write-uid',
	});
});

test('keep remote downloads the Drive version over the vault', async () => {
	const { local, payload, remote, values } = setup(2, 1);
	await keepRemoteResolver(payload);
	expect(local.calls.write.map(([key]) => key)).toStrictEqual(['note.md']);
	expect(remote.calls.write).toStrictEqual([]);
	expect(values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'write-uid',
		remote: 'remote-uid',
	});
});

test('latest survives copies the side with the newer modified time', async () => {
	const newerLocal = setup(5, 3);
	await latestSurviveResolver(newerLocal.payload);
	expect(newerLocal.remote.calls.write).toHaveLength(1);
	expect(newerLocal.local.calls.write).toHaveLength(0);

	const newerRemote = setup(3, 5);
	await latestSurviveResolver(newerRemote.payload);
	expect(newerRemote.local.calls.write).toHaveLength(1);
	expect(newerRemote.remote.calls.write).toHaveLength(0);
	expect(newerRemote.values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'write-uid',
		remote: 'remote-uid',
	});
});

test('equal times keep the Drive version', async () => {
	const tie = setup(4, 4);
	await latestSurviveResolver(tie.payload);
	expect(tie.local.calls.write).toHaveLength(1);
});
