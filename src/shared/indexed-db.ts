// Promise wrappers for IndexedDB, whose event-based API is easy to get subtly wrong:
// A request that fails, a transaction that aborts, a connection another tab wants to upgrade.

export type Connection = IDBDatabase;

export function settle<R>(request: IDBRequest<R>) {
	return new Promise<R>((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result));
		request.addEventListener('error', () =>
			reject(failure('request failed', storeNames(request.source), request.error)),
		);
	});
}

export function completion(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		const stores = () => [...(transaction.objectStoreNames ?? [])];
		transaction.addEventListener('complete', () => resolve());
		transaction.addEventListener('error', () =>
			reject(failure('transaction failed', stores(), transaction.error)),
		);
		transaction.addEventListener('abort', () =>
			reject(failure('transaction aborted', stores(), transaction.error)),
		);
	});
}

// Duck-typed: an object store has a name, an index leads to its store, a cursor to neither.
function storeNames(source: IDBRequest['source'] | undefined) {
	const store = source && 'objectStore' in source ? source.objectStore : source;
	return store && 'name' in store ? [store.name] : [];
}

// Names the stores and the cause, so a log from a device tells which write stopped and why.
// A pending request sees an abort before its transaction does, so both paths word it alike.
function failure(outcome: string, stores: Array<string>, cause: DOMException | null | undefined) {
	const where = stores.length > 0 ? ` on ${stores.join(', ')}` : '';
	const why = cause ? `: ${cause.name}: ${cause.message}` : '';
	return new DOMException(`IndexedDB ${outcome}${where}${why}`, cause?.name ?? 'UnknownError');
}

// One request in its own transaction; resolves once the transaction has committed.
export async function single<R>(
	db: Connection,
	storeName: string,
	mode: IDBTransactionMode,
	makeRequest: (store: IDBObjectStore) => IDBRequest<R>,
) {
	const transaction = db.transaction(storeName, mode);
	const [result] = await Promise.all([
		settle(makeRequest(transaction.objectStore(storeName))),
		completion(transaction),
	]);
	return result;
}

export function openDatabase(
	name: string,
	version: number | undefined,
	handlers: {
		upgrade?: (db: Connection) => void;
		// Another connection asked for a newer version or a delete.
		versionChange: () => void;
		// The browser closed the connection on its own.
		closed: () => void;
	},
) {
	return new Promise<Connection>((resolve, reject) => {
		const request = indexedDB.open(name, version);
		request.addEventListener('upgradeneeded', () => handlers.upgrade?.(request.result));
		request.addEventListener('success', () => {
			const db = request.result;
			db.addEventListener('versionchange', handlers.versionChange);
			db.addEventListener('close', handlers.closed);
			resolve(db);
		});
		request.addEventListener('error', () =>
			reject(request.error ?? new Error('IndexedDB request failed')),
		);
	});
}
