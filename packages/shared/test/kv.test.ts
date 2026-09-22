import { expect, test } from 'bun:test';
import { deleteMemoryDB, openMemoryDB } from '@/kv';

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
