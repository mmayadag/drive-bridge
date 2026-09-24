// When both sides changed with no common base: identical content just records the tie,
// otherwise the newer side keeps the name and the older one is renamed alongside it.

import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { RecordStore } from '@/modules/storage';
import type { RecordStat } from '@/types';
import renameAndKeepBothResolver from '@/sync/conflict-resolve/rename-and-keep-both';

const { bytes, file, fs } = testKit;

function recordStore() {
	const values = new Map<string, RecordStat>();
	const store = {
		batch: (operations: Array<{ type: string; key: string; value?: RecordStat }>) => {
			for (const operation of operations)
				if (operation.value) values.set(operation.key, operation.value);
			return Promise.resolve([]);
		},
		set: (key: string, value: RecordStat) => Promise.resolve(void values.set(key, value)),
	};
	return { store: store as unknown as RecordStore, values };
}

test('identical content on both sides just records the tie, no rename', async () => {
	const local = fs({ control: { read: () => bytes('same content') } });
	const remote = fs({ control: { read: () => bytes('same content') } });
	const record = recordStore();

	await renameAndKeepBothResolver({
		key: 'note.md',
		local: file('note.md', { mtime: 1, uid: 'local-1' }),
		localFs: local.fs,
		record: record.store,
		remote: file('note.md', { mtime: 2, uid: 'remote-1' }),
		remoteFs: remote.fs,
	});

	expect(local.calls.move).toHaveLength(0);
	expect(remote.calls.move).toHaveLength(0);
	expect(record.values.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-1',
		remote: 'remote-1',
	});
});
