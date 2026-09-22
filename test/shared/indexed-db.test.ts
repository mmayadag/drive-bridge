// The promise wrappers, including the failure paths a real database only reaches rarely.

// Installs a working IndexedDB on globalThis for this test file.
// oxlint-disable-next-line import/no-unassigned-import
import 'fake-indexeddb/auto';
import { expect, test } from 'bun:test';
import { completion, openDatabase, settle, single } from '@/shared/indexed-db';

const ignore = () => {};

// Requests and transactions are event targets carrying `result` and `error`, which is all
// The wrappers read.
type Fake = EventTarget & { result?: unknown; error?: DOMException };

function fakeRequest(): Fake {
	return new EventTarget();
}

async function caught(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return String(error);
	}
	return 'no error';
}

test('settle resolves with the request result', async () => {
	const request = fakeRequest();
	request.result = 'value';
	const promise = settle(request as unknown as IDBRequest<string>);
	request.dispatchEvent(new Event('success'));
	expect(await promise).toBe('value');
});

test('settle rejects with the request error', async () => {
	const request = fakeRequest();
	request.error = new DOMException('quota exceeded', 'QuotaExceededError');
	const promise = settle(request as unknown as IDBRequest<string>);
	request.dispatchEvent(new Event('error'));
	expect(await caught(promise)).toContain('quota exceeded');
});

test('settle rejects with a fallback when the request carries no error', async () => {
	const request = fakeRequest();
	const promise = settle(request as unknown as IDBRequest<string>);
	request.dispatchEvent(new Event('error'));
	expect(await caught(promise)).toContain('IndexedDB request failed');
});

test('completion resolves when the transaction commits', async () => {
	const transaction = fakeRequest();
	const promise = completion(transaction as unknown as IDBTransaction);
	transaction.dispatchEvent(new Event('complete'));
	expect(await promise).toBeUndefined();
});

test('completion rejects on a transaction error', async () => {
	const transaction = fakeRequest();
	transaction.error = new DOMException('write failed', 'UnknownError');
	const promise = completion(transaction as unknown as IDBTransaction);
	transaction.dispatchEvent(new Event('error'));
	expect(await caught(promise)).toContain('write failed');
});

test('completion rejects on an abort, even without an error', async () => {
	const transaction = fakeRequest();
	const promise = completion(transaction as unknown as IDBTransaction);
	transaction.dispatchEvent(new Event('abort'));
	expect(await caught(promise)).toContain('Transaction aborted');
});

test('completion reports the error behind an abort', async () => {
	const transaction = fakeRequest();
	transaction.error = new DOMException('out of space', 'QuotaExceededError');
	const promise = completion(transaction as unknown as IDBTransaction);
	transaction.dispatchEvent(new Event('abort'));
	expect(await caught(promise)).toContain('out of space');
});

test('openDatabase reports a version that is older than the stored one', async () => {
	const name = `idb-version-${Date.now()}`;
	const first = await openDatabase(name, 2, {
		closed: ignore,
		upgrade: (db) => void db.createObjectStore('notes'),
		versionChange: ignore,
	});
	first.close();

	expect(
		await caught(openDatabase(name, 1, { closed: ignore, versionChange: ignore })),
	).toContain('Error');
});

test('single runs one request inside its own transaction', async () => {
	const name = `idb-single-${Date.now()}`;
	const db = await openDatabase(name, 1, {
		closed: ignore,
		upgrade: (connection) => void connection.createObjectStore('notes'),
		versionChange: ignore,
	});

	await single(db, 'notes', 'readwrite', (store) => store.put('written', 'a.md'));
	expect(await single(db, 'notes', 'readonly', (store) => store.get('a.md'))).toBe('written');
	db.close();
});
