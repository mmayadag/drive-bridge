// The storage module: per-namespace record stores in IndexedDB, plus the shared memory
// database. The record helpers tolerate a missing backend, which makes getNamespace throw.

// Installs a working IndexedDB on globalThis for this test file.
// oxlint-disable-next-line import/no-unassigned-import
import 'fake-indexeddb/auto';
import { expect, test } from 'bun:test';
import type { StoreSync } from '@/shared/key-value-store';
import Storage from '@/modules/storage';

function create(namespace: () => string) {
	return new Storage({ getNamespace: namespace });
}

const stat = { ctime: 1, mtime: 1, size: 1 } as never;

test('record stores are keyed by the current namespace unless one is given', async () => {
	const storage = create(() => 'account-a');
	const { deleteRecordStore, getRecordStore, recordStoreExists } = storage.root;

	expect(await recordStoreExists()).toBe(false);
	await getRecordStore().set('note.md', stat);
	await getRecordStore('account-b').set('other.md', stat);
	expect(await recordStoreExists()).toBe(true);
	expect(await recordStoreExists('account-b')).toBe(true);
	expect(await getRecordStore().keys()).toStrictEqual(['note.md']);

	await deleteRecordStore();
	expect(await recordStoreExists()).toBe(false);
	expect(await recordStoreExists('account-b')).toBe(true);

	await storage.root.clearRecordStores();
	expect(await recordStoreExists('account-b')).toBe(false);
	storage.dispose();
});

test('without a backend, a store is assumed absent and deleting it does nothing', async () => {
	const storage = create(() => {
		throw new Error('no backend');
	});
	expect(await storage.root.recordStoreExists()).toBe(false);
	expect(storage.root.deleteRecordStore()).toBeUndefined();
	storage.dispose();
});

test('the memory database is shared and emptied on dispose', () => {
	type Shared = { getStore: (name: string) => StoreSync<number> };
	const sharedStore = (storage: Storage) => (storage.root.memoryDB as Shared).getStore('shared');

	const first = create(() => 'a');
	sharedStore(first).set('x', 1);
	const second = create(() => 'a');
	expect(sharedStore(second).get('x')).toBe(1);

	first.dispose();
	const third = create(() => 'a');
	expect(sharedStore(third).get('x')).toBeUndefined();
	second.dispose();
	third.dispose();
});
