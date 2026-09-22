// Key-value storage with one interface over two backends: in-memory (sync) and IndexedDB (async).
// Each database holds named stores; stores are created on first use.

type Empty = Record<never, never>;
type IsPromise<T, Async extends boolean> = Async extends true ? Promise<T> : T;

export type GetResult<T> = { key: string; value: T | undefined };
export type StoreOperations<T> =
	| { type: 'get'; key: string }
	| { type: 'set'; key: string; value: T }
	| { type: 'delete'; key: string };

// Method signatures on purpose: bivariance lets Store<RecordStat> pass as Store<unknown>.
/* oxlint-disable typescript/method-signature-style */
type Store<T, Async extends boolean> = {
	get(key: string): IsPromise<T | undefined, Async>;
	set(key: string, value: T): IsPromise<void, Async>;
	delete(key: string): IsPromise<void, Async>;
	clear(): IsPromise<void, Async>;
	keys(): IsPromise<Array<string>, Async>;
	values(): IsPromise<Array<T>, Async>;
	entries(): IsPromise<Array<[string, T]>, Async>;
	batch(operations: Array<StoreOperations<T>>): IsPromise<Array<GetResult<T>>, Async>;
};

type Database<
	D extends Record<string, unknown>,
	M extends Record<string, unknown>,
	Async extends boolean,
> = {
	getStore<K extends keyof D>(name: K): Store<D[K], Async>;
	getStoreNames(): IsPromise<Array<string>, Async>;
	deleteStore(name: string): IsPromise<void, Async>;
	clearStores(): IsPromise<void, Async>;
	getMeta<K extends keyof M>(key: K): IsPromise<M[K] | undefined, Async>;
	setMeta<K extends keyof M>(key: K, value: M[K]): IsPromise<void, Async>;
	dispose(): IsPromise<void, Async>;
};

/* oxlint-enable typescript/method-signature-style */

export type StoreSync<T = unknown> = Store<T, false>;
export type StoreAsync<T = unknown> = Store<T, true>;
export type DatabaseSync<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = Empty,
> = Database<D, M, false>;
export type DatabaseAsync<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = Empty,
> = Database<D, M, true>;

const noop = () => {};

// --- Memory backend ---------------------------------------------------------------------

class MemoryStore<T> implements StoreSync<T> {
	private readonly map = new Map<string, T>();

	get = (key: string) => this.map.get(key);
	set = (key: string, value: T) => void this.map.set(key, value);
	delete = (key: string) => void this.map.delete(key);
	clear = () => this.map.clear();
	keys = () => [...this.map.keys()];
	values = () => [...this.map.values()];
	entries = () => [...this.map.entries()];

	batch = (operations: Array<StoreOperations<T>>) => {
		const results: Array<GetResult<T>> = [];
		for (const operation of operations)
			if (operation.type === 'get')
				results.push({ key: operation.key, value: this.map.get(operation.key) });
			else if (operation.type === 'set') this.map.set(operation.key, operation.value);
			else this.map.delete(operation.key);
		return results;
	};
}

class MemoryDatabase {
	private readonly stores = new Map<string, MemoryStore<unknown>>();
	private readonly meta: Record<string, unknown> = {};

	getStore = (name: PropertyKey) => {
		const key = String(name);
		let store = this.stores.get(key);
		if (!store) {
			store = new MemoryStore();
			this.stores.set(key, store);
		}
		return store;
	};
	getStoreNames = () => [...this.stores.keys()];
	deleteStore = (name: string) => void this.stores.delete(name);
	clearStores = () => this.stores.clear();
	getMeta = (key: PropertyKey) => this.meta[String(key)];
	setMeta = (key: PropertyKey, value: unknown) => void (this.meta[String(key)] = value);
	dispose = noop;
}

// Memory databases are shared by name for the lifetime of the page.
const memoryDatabases = new Map<string, MemoryDatabase>();

export function openMemoryDB<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = Empty,
>(name: string): DatabaseSync<D, M> {
	let database = memoryDatabases.get(name);
	if (!database) {
		database = new MemoryDatabase();
		memoryDatabases.set(name, database);
	}
	return database as unknown as DatabaseSync<D, M>;
}

export function deleteMemoryDB(name: string) {
	memoryDatabases.delete(name);
}

// --- IndexedDB backend ------------------------------------------------------------------

const META_STORE = '__meta__';
function assertNotMetaStore(name: string) {
	if (name === META_STORE) throw new Error('Cannot access internal meta store');
}

class NeedsUpgradeError extends Error {
	override name = 'NeedsUpgradeError';
}

type Connection = IDBDatabase;

// Promise wrappers over the IndexedDB request API.
function settle<R>(request: IDBRequest<R>) {
	return new Promise<R>((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result));
		request.addEventListener('error', () =>
			reject(request.error ?? new Error('IndexedDB request failed')),
		);
	});
}

function completion(transaction: IDBTransaction) {
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
async function single<R>(
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

function openDatabase(
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

// Readers share the connection; creating or deleting stores needs an upgrade that runs alone.
class ReadWriteGate {
	private readers = 0;
	private writer = false;
	private waitingWriters = 0;
	private readonly readWaiters: Array<() => void> = [];
	private readonly writeWaiters: Array<() => void> = [];

	private wake() {
		if (this.writer || this.readers > 0) return;
		const nextWriter = this.writeWaiters.shift();
		if (nextWriter) {
			this.writer = true;
			nextWriter();
			return;
		}
		while (this.readWaiters.length > 0 && this.writeWaiters.length === 0) {
			this.readers++;
			this.readWaiters.shift()?.();
		}
	}

	private async acquireShared() {
		if (!this.writer && this.waitingWriters === 0) {
			this.readers++;
			return;
		}
		await new Promise<void>((resolve) => {
			this.readWaiters.push(resolve);
		});
	}

	private async acquireExclusive() {
		this.waitingWriters++;
		if (!this.writer && this.readers === 0) {
			this.waitingWriters--;
			this.writer = true;
			return;
		}
		await new Promise<void>((resolve) => {
			this.writeWaiters.push(resolve);
		});
		this.waitingWriters--;
	}

	private releaseShared() {
		this.readers--;
		if (this.readers === 0) this.wake();
	}

	async shared<T>(task: () => Promise<T>) {
		await this.acquireShared();
		try {
			return await task();
		} finally {
			this.releaseShared();
		}
	}

	async exclusive<T>(task: () => Promise<T>) {
		await this.acquireExclusive();
		try {
			return await task();
		} finally {
			this.writer = false;
			this.wake();
		}
	}

	// Called while holding the exclusive lock: turns it into a shared one.
	async downgrade<T>(task: () => Promise<T>) {
		this.writer = false;
		this.readers++;
		this.wake();
		try {
			return await task();
		} finally {
			this.releaseShared();
		}
	}
}

class IndexedDBStore<T> implements StoreAsync<T> {
	constructor(
		private readonly run: <R>(task: (db: Connection) => Promise<R>) => Promise<R>,
		private readonly storeName: string,
	) {}

	private readonly single = <R>(
		mode: IDBTransactionMode,
		makeRequest: (store: IDBObjectStore) => IDBRequest<R>,
	) => this.run((db) => single(db, this.storeName, mode, makeRequest));

	get = (key: string) =>
		this.single('readonly', (store) => store.get(key) as IDBRequest<T | undefined>);
	set = async (key: string, value: T) =>
		void (await this.single('readwrite', (store) => store.put(value, key)));
	delete = async (key: string) => this.single('readwrite', (store) => store.delete(key));
	clear = async () => this.single('readwrite', (store) => store.clear());
	values = () => this.single('readonly', (store) => store.getAll() as IDBRequest<Array<T>>);

	keys = async () =>
		(await this.single('readonly', (store) => store.getAllKeys())).map((key) => {
			if (typeof key !== 'string') throw new TypeError('IndexedDB store key is not a string');
			return key;
		});

	entries = () =>
		this.run(async (db) => {
			const transaction = db.transaction(this.storeName, 'readonly');
			const store = transaction.objectStore(this.storeName);
			const [keys, values] = await Promise.all([
				settle(store.getAllKeys()),
				settle(store.getAll() as IDBRequest<Array<T>>),
				completion(transaction),
			]);
			return keys.map((key, index) => [key, values[index]] as [string, T]);
		});

	batch = (operations: Array<StoreOperations<T>>) => {
		if (!operations.length) return Promise.resolve([]);
		return this.run(async (db) => {
			const readOnly = operations.every((operation) => operation.type === 'get');
			const transaction = db.transaction(this.storeName, readOnly ? 'readonly' : 'readwrite');
			const store = transaction.objectStore(this.storeName);
			// Every request is queued synchronously so they all land in this transaction.
			const pending = operations.map(async (operation): Promise<GetResult<T> | void> => {
				if (operation.type === 'get') {
					const value = await settle(
						store.get(operation.key) as IDBRequest<T | undefined>,
					);
					return { key: operation.key, value };
				}
				await (operation.type === 'set'
					? settle(store.put(operation.value, operation.key))
					: settle(store.delete(operation.key)));
			});
			const [results] = await Promise.all([Promise.all(pending), completion(transaction)]);
			return results.filter((result): result is GetResult<T> => result !== undefined);
		});
	};
}

class IndexedDBDatabase {
	private connection?: Promise<Connection>;
	private readonly gate = new ReadWriteGate();

	constructor(private readonly name: string) {}

	private createConnection(version?: number, upgrade?: (db: Connection) => void) {
		const connection: Promise<Connection> = openDatabase(this.name, version, {
			closed: () => {
				if (this.connection === connection) this.connection = undefined;
			},
			upgrade,
			// Another tab wants to upgrade: let go so it isn't blocked.
			versionChange: () => {
				if (this.connection === connection) this.connection = undefined;
				connection.then(
					(db) => db.close(),
					() => {},
				);
			},
		});
		return connection;
	}

	private async getConnection() {
		const connection = this.connection ?? this.createConnection();
		this.connection = connection;
		try {
			return await connection;
		} catch (error) {
			if (this.connection === connection) this.connection = undefined;
			throw error;
		}
	}

	// Reopens with a higher version and runs `upgrade` while `needsUpgrade` holds.
	private async openUnlocked(
		needsUpgrade: (db: Connection) => unknown,
		upgrade: (db: Connection) => void,
	) {
		for (;;) {
			const current = await this.getConnection();
			if (!needsUpgrade(current)) return current;
			current.close();
			const next = this.createConnection(current.version + 1, upgrade);
			this.connection = next;
			try {
				const db = await next;
				if (!needsUpgrade(db)) return db;
			} catch (error) {
				// Another tab upgraded first; retry against the new version.
				if (!(error instanceof DOMException) || error.name !== 'VersionError') throw error;
				if (this.connection === next) this.connection = undefined;
			}
		}
	}

	private open(needsUpgrade: (db: Connection) => unknown, upgrade: (db: Connection) => void) {
		return this.gate.exclusive(() => this.openUnlocked(needsUpgrade, upgrade));
	}

	private async withStore<R>(storeName: string, task: (db: Connection) => Promise<R>) {
		try {
			return await this.gate.shared(async () => {
				const db = await this.getConnection();
				if (!db.objectStoreNames.contains(storeName)) throw new NeedsUpgradeError();
				return task(db);
			});
		} catch (error) {
			if (!(error instanceof NeedsUpgradeError)) throw error;
			return this.gate.exclusive(async () => {
				const db = await this.openUnlocked(
					(conn) => !conn.objectStoreNames.contains(storeName),
					(conn) => conn.createObjectStore(storeName),
				);
				return this.gate.downgrade(() => task(db));
			});
		}
	}

	getStore = (name: PropertyKey) => {
		const storeName = String(name);
		assertNotMetaStore(storeName);
		return new IndexedDBStore<unknown>((task) => this.withStore(storeName, task), storeName);
	};

	getStoreNames = async () =>
		[...(await this.getConnection()).objectStoreNames].filter((name) => name !== META_STORE);

	deleteStore = async (name: string) => {
		assertNotMetaStore(name);
		if (!(await this.getConnection()).objectStoreNames.contains(name)) return;
		await this.open(
			(db) => db.objectStoreNames.contains(name),
			(db) => db.deleteObjectStore(name),
		);
	};

	clearStores = async () => {
		const userStores = (db: Connection) =>
			[...db.objectStoreNames].filter((name) => name !== META_STORE);
		if (!userStores(await this.getConnection()).length) return;
		await this.open(
			(db) => userStores(db).length,
			(db) => {
				for (const name of userStores(db)) db.deleteObjectStore(name);
			},
		);
	};

	getMeta = (key: PropertyKey) =>
		this.withStore(META_STORE, (db) =>
			single(db, META_STORE, 'readonly', (store) => store.get(String(key))),
		);

	setMeta = async (key: PropertyKey, value: unknown) =>
		void (await this.withStore(META_STORE, (db) =>
			single(db, META_STORE, 'readwrite', (store) => store.put(value, String(key))),
		));

	dispose = () =>
		this.gate.exclusive(async () => {
			if (this.connection) (await this.connection).close();
		});
}

export function openIndexedDB<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = Empty,
>(name: string): DatabaseAsync<D, M> {
	return new IndexedDBDatabase(name) as unknown as DatabaseAsync<D, M>;
}

export function deleteIndexedDB(name: string) {
	return settle(indexedDB.deleteDatabase(name)).then(noop);
}
