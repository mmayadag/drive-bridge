import { expect, test } from 'bun:test';
import { deleteMemoryDB, openMemoryDB } from '@/shared/key-value-store';

test('memory stores keep values per store', () => {
	const db = openMemoryDB<Record<string, number>>('kv-test-stores');
	const a = db.getStore('a');
	a.set('x', 1);
	db.getStore('b').set('x', 2);
	expect(a.get('x')).toBe(1);
	expect(db.getStore('b').get('x')).toBe(2);
	expect(db.getStoreNames().toSorted()).toEqual(['a', 'b']);
	deleteMemoryDB('kv-test-stores');
});

test('memory batch applies writes in order and returns reads', () => {
	const store = openMemoryDB<Record<string, string>>('kv-test-batch').getStore('s');
	const results = store.batch([
		{ key: 'k', type: 'set', value: 'v1' },
		{ key: 'k', type: 'get' },
		{ key: 'k', type: 'delete' },
		{ key: 'k', type: 'get' },
	]);
	expect(results).toEqual([
		{ key: 'k', value: 'v1' },
		{ key: 'k', value: undefined },
	]);
	deleteMemoryDB('kv-test-batch');
});

test('memory databases are shared by name until deleted', () => {
	const open = () => openMemoryDB<Record<string, unknown>, { m: number }>('kv-test-shared');
	open().setMeta('m', 1);
	expect(open().getMeta('m')).toBe(1);
	deleteMemoryDB('kv-test-shared');
	expect(open().getMeta('m')).toBeUndefined();
});

test('disposing a memory database is a no-op', () => {
	const db = openMemoryDB('kv-test-dispose');
	db.getStore('s').set('k', 'v');
	expect(db.dispose()).toBeUndefined();
	expect(db.getStore('s').get('k')).toBe('v');
	deleteMemoryDB('kv-test-dispose');
});

test('a memory store lists, deletes and clears its entries', () => {
	const db = openMemoryDB<Record<string, number>>('kv-test-listing');
	const store = db.getStore('s');
	store.set('a', 1);
	store.set('b', 2);
	expect(store.keys()).toStrictEqual(['a', 'b']);
	expect(store.values()).toStrictEqual([1, 2]);
	expect(store.entries()).toStrictEqual([
		['a', 1],
		['b', 2],
	]);

	store.delete('a');
	expect(store.keys()).toStrictEqual(['b']);
	store.clear();
	expect(store.entries()).toStrictEqual([]);
	deleteMemoryDB('kv-test-listing');
});

test('a memory database deletes one store or clears them all', () => {
	const db = openMemoryDB<Record<string, number>>('kv-test-drop');
	db.getStore('a').set('x', 1);
	db.getStore('b').set('x', 2);

	db.deleteStore('a');
	expect(db.getStoreNames()).toStrictEqual(['b']);
	expect(db.getStore('a').get('x')).toBeUndefined();

	db.clearStores();
	expect(db.getStoreNames()).toStrictEqual([]);
	deleteMemoryDB('kv-test-drop');
});
