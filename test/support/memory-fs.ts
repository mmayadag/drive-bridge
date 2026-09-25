// An in-memory file system and record store, for driving a whole sync without Obsidian or Drive.

import type { RootFs } from '@/fs';
import type { RecordStore } from '@/modules/storage';
import type { Binary, MaybePromise, RecordStat, Stat } from '@/types';

type Entry = { data: Binary; mtime: number; uid: string };

export type MemoryFs = {
	fs: RootFs;
	/** Files by key; a new write gets a new uid. */
	files: Map<string, Entry>;
	folders: Set<string>;
	/** The text of a file, or undefined when it is missing. */
	text: (key: string) => string | undefined;
	/** Keys whose writes throw, or wait for the returned promise first. */
	onWrite: Map<string, () => MaybePromise<void>>;
	put: (key: string, text: string) => string;
	/** Deletes a file, or a folder with everything in it, right away. */
	remove: (key: string) => void;
	rename: (oldKey: string, newKey: string) => void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parents(key: string) {
	const parts = key.split('/');
	const result: Array<string> = [];
	for (let i = 1; i < parts.length; i++) result.push(`${parts.slice(0, i).join('/')}/`);
	return result;
}

/** `initial` maps keys to text; a key ending in `/` is a folder. */
export function memoryFs(name: string, initial: Record<string, string> = {}): MemoryFs {
	const files = new Map<string, Entry>();
	const folders = new Set<string>();
	const onWrite = new Map<string, () => MaybePromise<void>>();
	let counter = 0;

	const put = (key: string, text: string | Binary) => {
		for (const parent of parents(key)) folders.add(parent);
		counter += 1;
		const uid = `${name}-${counter}`;
		files.set(key, {
			data: typeof text === 'string' ? encoder.encode(text) : text,
			mtime: counter,
			uid,
		});
		return uid;
	};
	for (const [key, text] of Object.entries(initial))
		if (key.endsWith('/')) {
			folders.add(key);
			for (const parent of parents(key)) folders.add(parent);
		} else put(key, text);

	const stat = (key: string): Stat | undefined => {
		if (folders.has(key)) return { isDir: true, key };
		const entry = files.get(key);
		if (!entry) return undefined;
		return { isDir: false, key, mtime: entry.mtime, size: entry.data.length, uid: entry.uid };
	};

	const remove = (key: string) => {
		for (const existing of [...files.keys(), ...folders])
			if (existing === key || (key.endsWith('/') && existing.startsWith(key))) {
				files.delete(existing);
				folders.delete(existing);
			}
	};
	const rename = (oldKey: string, newKey: string) => {
		const entry = files.get(oldKey);
		if (!entry) throw new Error(`ENOENT: ${oldKey}`);
		files.delete(oldKey);
		files.set(newKey, entry);
	};

	const fs: RootFs = {
		delete: (key) => remove(key),
		exists: (key) => key === '/' || stat(key) !== undefined,
		getUid: () => name,
		// Asks the reporter about each item, like the vault listing, and leaves out what it excludes.
		list: async (_key, reporter) => {
			const all = [...[...folders].toSorted(), ...[...files.keys()].toSorted()];
			const excluded: Array<string> = [];
			const result: Array<Stat> = [];
			for (const [index, key] of all.entries()) {
				if (excluded.some((folder) => key.startsWith(folder))) continue;
				const report = await reporter({
					completed: index,
					current: key,
					total: all.length,
				});
				if (report === 'exclude') {
					if (key.endsWith('/')) excluded.push(key);
					continue;
				}
				const item = stat(key);
				if (item) result.push(item);
			}
			return result;
		},
		mkdir: (key) => {
			if (key === '/') return;
			folders.add(key);
			for (const parent of parents(key)) folders.add(parent);
		},
		move: (oldKey, newKey) => rename(oldKey, newKey),
		read: (key) => {
			const entry = files.get(key);
			if (!entry) throw new Error(`ENOENT: ${key}`);
			return entry.data;
		},
		readStream: () => {
			throw new Error('Streams are not used for small files.');
		},
		stat: (key) => stat(key) as Stat,
		write: async (key, value) => {
			await onWrite.get(key)?.();
			return put(key, value);
		},
		writeStream: () => {
			throw new Error('Streams are not used for small files.');
		},
	};

	return {
		files,
		folders,
		fs,
		onWrite,
		put,
		remove,
		rename,
		text: (key) => {
			const entry = files.get(key);
			return entry && decoder.decode(entry.data);
		},
	};
}

export function memoryRecords(initial: Record<string, RecordStat> = {}) {
	const values = new Map<string, RecordStat>(Object.entries(initial));
	const store = {
		batch: () => Promise.resolve([]),
		clear: () => Promise.resolve(values.clear()),
		delete: (key: string) => Promise.resolve(void values.delete(key)),
		entries: () => Promise.resolve([...values.entries()]),
		get: (key: string) => Promise.resolve(values.get(key)),
		keys: () => Promise.resolve([...values.keys()]),
		set: (key: string, value: RecordStat) => Promise.resolve(void values.set(key, value)),
		values: () => Promise.resolve([...values.values()]),
	} satisfies RecordStore;
	return { store, values };
}
