// Promise wrappers for IndexedDB, whose event-based API is easy to get subtly wrong:
// A request that fails, a transaction that aborts, a connection another tab wants to upgrade.

export type Connection = IDBDatabase;

export function settle<R>(request: IDBRequest<R>) {
	return new Promise<R>((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result));
		request.addEventListener('error', () =>
			reject(request.error ?? new Error('IndexedDB request failed')),
		);
	});
}

export function completion(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		transaction.addEventListener('complete', () => resolve());
		transaction.addEventListener('error', () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed')),
		);
		transaction.addEventListener('abort', () =>
			reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError')),
		);
	});
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
