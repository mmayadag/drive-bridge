import type { Vault, Stat, ListedFiles, App } from 'obsidian';
import { Platform, TFile, TFolder } from 'obsidian';
import type { Binary, MaybePromise } from '@/types';
import { OS } from '@/modules/event-bus';
import { toArrayBuffer, toUint8Array } from '@/shared/binary';
import { basename, isFolder, stripEndSlash } from '@/shared/path';
import { createBufferReadStream } from '@/shared/read-stream';
import { chunkSize } from '@/utils/pipe';

export const TEMP_FOLDER = '.trash';

type VaultRequestParam = (
	| { method: 'GET' }
	| { method: 'GET_STREAM'; size: number }
	| { method: 'PUT'; value: Binary; mtime?: number; ctime?: number }
	| { method: 'APPEND'; value: Binary; mtime?: number; ctime?: number }
	| { method: 'DELETE'; trash?: TrashOption }
	| { method: 'MOVE'; destination: string }
	| { method: 'MKDIR' }
	| { method: 'EXISTS' }
	| { method: 'STAT'; cached?: boolean }
	| { method: 'LIST'; cached?: boolean }
) & { ignoreCancellation?: boolean };

type VaultRequestResponseMap = {
	GET: Binary;
	GET_STREAM: ReadableStream<Binary>;
	PUT: void;
	APPEND: void;
	DELETE: void;
	MOVE: void;
	MKDIR: void;
	EXISTS: boolean;
	STAT: Stat;
	LIST: ListedFiles;
};

export type VaultRequest = <T extends VaultRequestParam = { method: 'GET' }>(
	key: string,
	params?: T,
) => Promise<VaultRequestResponseMap[T['method']]>;

// Obsidian can only read a vault file whole: the adapter has no ranged read, and requestUrl
// cannot address the app:// resource path ("ClientRequest only supports http: and https:
// protocols", Obsidian 1.13.7). A large file is therefore read once and handed on in chunks,
// so the whole file stays in memory until its upload ends. Above this size, phones skip it.
export const MOBILE_READ_LIMIT = 200 * 1024 ** 2;

function toVaultPath(key: string) {
	if (key === '/') return key;
	return stripEndSlash(key);
}

function toKey(vaultPath: string, isDir: boolean): string {
	if (vaultPath === '/') return '/';
	return isDir ? `${vaultPath}/` : vaultPath;
}

// Obsidian trashOption mapping:
// "none": permanent
// "system" / undefined: system
// "local": local
type TrashOption = 'local' | 'system' | 'permanent';
function getTrashOption(vault: Vault): TrashOption {
	const option = vault.config.trashOption;
	return option ? (option === 'none' ? 'permanent' : option) : 'system';
}

export default function createVaultRequest(app: App): VaultRequest {
	const { vault, workspace } = app;
	const { adapter } = vault;

	// Prevents vault scanning while Obsidian is indexing the vault
	const canUseCache = () => workspace.layoutReady;

	return async <T extends VaultRequestParam>(
		key: string,
		params?: T,
	): Promise<VaultRequestResponseMap[T['method']]> => {
		const path = toVaultPath(key);
		const get = () => adapter.readBinary(path).then((buffer) => toUint8Array(buffer)) as never;
		if (!params) return get();
		const { method } = params;

		if (method === 'GET') return get();
		if (method === 'GET_STREAM') {
			if (Platform.isMobileApp && params.size > MOBILE_READ_LIMIT)
				throw new Error(
					`File is too large to sync on this device (limit ${MOBILE_READ_LIMIT / 1024 ** 2} MB), sync it from a computer.`,
				);
			return createBufferReadStream(
				toUint8Array(await adapter.readBinary(path)),
				chunkSize,
			) as never;
		}
		if (method === 'PUT')
			return withNameCheck(key, () =>
				adapter.writeBinary(path, toArrayBuffer(params.value), params),
			) as never;
		if (method === 'APPEND')
			return withNameCheck(key, () =>
				adapter.appendBinary(path, toArrayBuffer(params.value), params),
			) as never;
		if (method === 'DELETE') {
			const { trash = getTrashOption(vault) } = params;
			if (trash === 'permanent') return adapter.remove(path) as never;
			if (trash === 'local' || !(await adapter.trashSystem(path)))
				await adapter.trashLocal(path);
			return undefined as never;
		}
		if (method === 'MOVE')
			return withNameCheck(params.destination, () =>
				adapter.rename(path, toVaultPath(params.destination)),
			) as never;
		if (method === 'MKDIR')
			return (
				key === '/' ? undefined : withNameCheck(key, () => adapter.mkdir(path))
			) as never;
		if (method === 'EXISTS') {
			if (vault.getAbstractFileByPath(path)) return true as never;
			return adapter.exists(path, true) as never;
		}
		if (method === 'STAT') {
			if (isFolder(key)) return { ctime: 0, mtime: 0, size: 0, type: 'folder' } as never;
			if (canUseCache() && (params.cached ?? true)) {
				const file = vault.getAbstractFileByPath(path);
				if (file instanceof TFile) return { ...file.stat, type: 'file' } as never;
				else if (file instanceof TFolder)
					return { ctime: 0, mtime: 0, size: 0, type: 'folder' } as never;
			}
			const raw = await adapter.stat(path);
			if (!raw) throw new Error(`Stat of "${path}" not found!`);
			return raw as never;
		}
		if (method === 'LIST') {
			const children: ListedFiles = { files: [], folders: [] };
			if (canUseCache() && (params.cached ?? true)) {
				const folder = vault.getAbstractFileByPath(path);
				if (folder instanceof TFolder) {
					folder.children.forEach((child) =>
						child instanceof TFolder
							? children.folders.push(toKey(child.path, true))
							: children.files.push(child.path),
					);
					return children as never;
				}
			}
			const { files, folders } = await adapter.list(path);
			children.files.push(...files);
			children.folders.push(...folders.map((folder) => toKey(folder, true)));
			return children as never;
		}
		return undefined as never;
	};
}

// Most file systems cap a name (one path segment) at 255 bytes; Drive allows longer ones.
const NAME_BYTES = 255;

// A name the OS will never accept, however many times the write is retried.
export class UnusableNameError extends Error {
	override readonly name = 'UnusableNameError';
}

// A write that fails on a name the OS rejects gets an error saying why, and is marked so the
// caller can skip the file immediately instead of retrying a name that will never work.
async function withNameCheck<T>(key: string, action: () => MaybePromise<T>): Promise<T> {
	const name = basename(key);
	if (/﻿/u.test(name))
		throw new UnusableNameError(`Name "${name}" starts with a byte order mark!`);
	try {
		return await action();
	} catch (error: unknown) {
		if (OS.Windows) {
			const match = /[<>:"/\\|?*]/u.exec(name);
			if (match)
				throw new UnusableNameError(
					`Windows forbids character "${match[0]}" in file names!`,
					{
						cause: error,
					},
				);
		}
		const encoder = new TextEncoder();
		const long = key.split('/').find((segment) => encoder.encode(segment).length > NAME_BYTES);
		if (long)
			throw new UnusableNameError(
				`Name "${long.slice(0, 40)}…" is longer than ${NAME_BYTES} bytes!`,
				{ cause: error },
			);
		throw error;
	}
}
