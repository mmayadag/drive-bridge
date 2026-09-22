import type { StoreAsync } from '@/shared/key-value-store';
import type { MaybePromise, RecordStat } from '@/types';
import { deleteMemoryDB, openIndexedDB, openMemoryDB } from '@/shared/key-value-store';

export type IndexedDBSchema = Record<string, RecordStat>;
export type RecordStore = StoreAsync<RecordStat>;

export const SYNC_STATE_STORE_NAME = 'sync-state';
export const STORAGE_NAME = 'drive-bridge';

export default class Storage {
	// Shared databases.
	// Each module reads them through a schema of its own, so the type here has to
	// fit every one of those schemas; `never` is the only type that does.
	private readonly memoryDB: never = openMemoryDB(STORAGE_NAME) as never;
	private readonly indexedDB = openIndexedDB<IndexedDBSchema>(STORAGE_NAME);

	constructor(private readonly ctx: { getNamespace: () => string }) {}

	private readonly getRecordStore = (namespace?: string) =>
		this.indexedDB.getStore(namespace || this.ctx.getNamespace());

	private readonly deleteRecordStore = (namespace?: string): MaybePromise<void> => {
		try {
			namespace ??= this.ctx.getNamespace();
		} catch {
			return; // When the backend is not set, no need to delete
		}
		return this.indexedDB.deleteStore(namespace);
	};

	private readonly clearRecordStores = () => this.indexedDB.clearStores();

	private readonly recordStoreExists = (namespace?: string): MaybePromise<boolean> => {
		try {
			namespace ??= this.ctx.getNamespace();
		} catch {
			return false; // When the backend is not set, assume no store
		}
		return this.indexedDB.getStoreNames().then((names) => names.includes(namespace));
	};

	readonly root = {
		clearRecordStores: this.clearRecordStores,
		deleteRecordStore: this.deleteRecordStore,
		getRecordStore: this.getRecordStore,
		indexedDB: this.indexedDB as never,
		memoryDB: this.memoryDB,
		recordStoreExists: this.recordStoreExists,
	};

	readonly dispose = () => {
		deleteMemoryDB(STORAGE_NAME);
		void this.indexedDB.dispose();
	};
}
