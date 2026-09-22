// The IndexedDB backend of the key-value store, against a real IndexedDB (fake-indexeddb).

// Installs a working IndexedDB on globalThis for this test file.
// oxlint-disable-next-line import/no-unassigned-import
import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'bun:test';
import { deleteIndexedDB, openIndexedDB } from '@/shared/key-value-store';

type Schema = { notes: string; sizes: number };

let name = '';
let counter = 0;

beforeEach(() => {
	counter++;
	name = `kv-test-${counter}`;
});

const open = () => openIndexedDB<Schema, { lastRun: number }>(name);

test('creates a store on first use and reads back what it wrote', async () => {
	const db = open();
	const notes = db.getStore('notes');
	await notes.set('a.md', 'alpha');
	expect(await notes.get('a.md')).toBe('alpha');
	expect(await notes.get('missing.md')).toBeUndefined();
	expect(await db.getStoreNames()).toStrictEqual(['notes']);
	await db.dispose();
});

test('keeps stores apart and lists keys, values and entries', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');
	await db.getStore('sizes').set('a.md', 42);
	expect(await db.getStore('notes').get('a.md')).toBe('alpha');
	expect(await db.getStore('sizes').get('a.md')).toBe(42);

	const notes = db.getStore('notes');
	await notes.set('b.md', 'beta');
	expect((await notes.keys()).toSorted()).toStrictEqual(['a.md', 'b.md']);
	expect((await notes.values()).toSorted()).toStrictEqual(['alpha', 'beta']);
	expect(await notes.entries()).toStrictEqual([
		['a.md', 'alpha'],
		['b.md', 'beta'],
	]);
	await db.dispose();
});

test('deletes and clears entries', async () => {
	const db = open();
	const notes = db.getStore('notes');
	await notes.set('a.md', 'alpha');
	await notes.delete('a.md');
	expect(await notes.get('a.md')).toBeUndefined();

	await notes.set('b.md', 'beta');
	await notes.clear();
	expect(await notes.keys()).toStrictEqual([]);
	await db.dispose();
});

test('runs a batch in one transaction and returns only the reads', async () => {
	const db = open();
	const notes = db.getStore('notes');
	await notes.set('keep.md', 'kept');

	const results = await notes.batch([
		{ key: 'new.md', type: 'set', value: 'created' },
		{ key: 'new.md', type: 'get' },
		{ key: 'keep.md', type: 'delete' },
		{ key: 'keep.md', type: 'get' },
	]);

	expect(results).toStrictEqual([
		{ key: 'new.md', value: 'created' },
		{ key: 'keep.md', value: undefined },
	]);
	expect(await notes.keys()).toStrictEqual(['new.md']);
	expect(await notes.batch([])).toStrictEqual([]);
	await db.dispose();
});

test('stores metadata separately and hides its store', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');
	await db.setMeta('lastRun', 5);
	expect(await db.getMeta('lastRun')).toBe(5);
	expect(await db.getStoreNames()).toStrictEqual(['notes']);
	expect(() => db.getStore('__meta__' as 'notes')).toThrow('meta store');
	await db.dispose();
});

test('deletes one store and clears the rest without touching metadata', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');
	await db.getStore('sizes').set('a.md', 1);
	await db.setMeta('lastRun', 7);

	await db.deleteStore('notes');
	expect(await db.getStoreNames()).toStrictEqual(['sizes']);

	await db.clearStores();
	expect(await db.getStoreNames()).toStrictEqual([]);
	expect(await db.getMeta('lastRun')).toBe(7);
	await db.dispose();
});

test('survives stores being created concurrently', async () => {
	const db = open();
	await Promise.all([
		db.getStore('notes').set('a.md', 'alpha'),
		db.getStore('sizes').set('a.md', 1),
		db.getStore('notes').set('b.md', 'beta'),
	]);
	expect((await db.getStoreNames()).toSorted()).toStrictEqual(['notes', 'sizes']);
	expect((await db.getStore('notes').keys()).toSorted()).toStrictEqual(['a.md', 'b.md']);
	await db.dispose();
});

test('reopens after dispose and forgets everything after a delete', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');
	await db.dispose();

	expect(await open().getStore('notes').get('a.md')).toBe('alpha');

	await deleteIndexedDB(name);
	expect(await open().getStoreNames()).toStrictEqual([]);
});

test('a read waits while another store is being created', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');

	// Creating `sizes` needs a version upgrade, which holds the database alone; the read of
	// `notes` has to queue behind it and still return the right value.
	const [, value] = await Promise.all([
		db.getStore('sizes').set('a.md', 1),
		db.getStore('notes').get('a.md'),
	]);
	expect(value).toBe('alpha');
	await db.dispose();
});

test('survives another tab deleting the database underneath it', async () => {
	const db = open();
	await db.getStore('notes').set('a.md', 'alpha');

	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.addEventListener('success', () => resolve());
		request.addEventListener('error', () =>
			reject(request.error ?? new Error('delete failed')),
		);
	});

	expect(await db.getStore('notes').get('a.md')).toBeUndefined();
	await db.dispose();
});
