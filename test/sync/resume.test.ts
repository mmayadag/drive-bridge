// A sync that stops halfway (Obsidian closed, offline, cancelled) must not start over:
// each task writes its record as soon as it finishes, so the next plan skips it.

import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { RecordStore } from '@/modules/storage';
import type { RecordStat, Stat } from '@/types';
import { bidirectionalDecider } from '@/sync';
import Upload from '@/sync/tasks/upload';

const { bytes, file, fs, runDecider, taskKeys } = testKit;

function recordStore() {
	const values = new Map<string, RecordStat>();
	const store = {
		delete: (key: string) => Promise.resolve(void values.delete(key)),
		get: (key: string) => Promise.resolve(values.get(key)),
		set: (key: string, value: RecordStat) => Promise.resolve(void values.set(key, value)),
	};
	return { store: store as unknown as RecordStore, values };
}

test('an interrupted first sync only redoes what did not finish', async () => {
	const localFiles = ['a.md', 'b.md', 'c.md'].map((key) => file(key, { uid: `${key}-local` }));
	const localStats = new Map<string, Stat>(localFiles.map((stat) => [stat.key, stat]));
	const local = fs({ control: { read: () => bytes('text') } });
	const remote = fs();
	const record = recordStore();

	const first = runDecider(bidirectionalDecider, { localStats });
	expect(taskKeys(first).toSorted()).toStrictEqual(['a.md', 'b.md', 'c.md']);

	// Two of the three uploads finish before the sync stops.
	for (const stat of localFiles.slice(0, 2))
		await new Upload({
			key: stat.key,
			local: stat,
			localFs: local.fs,
			record: record.store,
			remoteFs: remote.fs,
		}).exec();

	const remoteStats = new Map<string, Stat>(
		['a.md', 'b.md'].map((key) => [key, file(key, { uid: 'write-uid' })]),
	);
	const second = runDecider(bidirectionalDecider, {
		localStats,
		records: record.values,
		remoteStats,
	});
	expect(second.map(({ key, name }) => `${name} ${key}`)).toStrictEqual(['upload c.md']);
});
