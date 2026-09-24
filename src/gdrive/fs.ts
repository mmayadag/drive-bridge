import type { ListReporter, RootFs } from '@/fs/interface';
import type { Request, RequestParam, RequestResponse } from '@/modules/registrar';
import type { DatabaseSync, StoreSync } from '@/shared/key-value-store';
import type { Binary, FileStat, Stat } from '@/types';
import { textToUint8Array } from '@/shared/binary';
import { getStatus } from '@/shared/error';
import { basename, dirname, isFolder } from '@/shared/path';
import createRangeReadStream from '@/shared/read-stream';
import { chunkSize, concurrency } from '@/utils/pipe';
import type { DriveFile, DriveFileList } from './api';
import type { RemoteScan, SnapshotDB } from './changes';
import {
	DRIVE_API,
	DRIVE_UPLOAD_API,
	FILE_FIELDS,
	FOLDER_MIME,
	buildUrl,
	escapeQuery,
	parseDriveError,
	toFileStat,
} from './api';
import { applyChanges, fullScanReason, getStartToken, snapshotStore } from './changes';
import { guessMimeType, resumableUpload, singleUpload } from './upload';

export type GdriveFsOptions = {
	userId: string;
	useTrash: boolean;
	remoteScan?: RemoteScan;
};

export type GdriveDB = DatabaseSync<{ gdriveIds: string }, { gdriveIdsMarker?: string }>;

const PAGE_SIZE = 1000;
const WRITE_FIELDS = 'id,md5Checksum';
const ROOT_ID = 'root';

function notFoundError(key: string): Error {
	const error = new Error(`Google Drive: ${key} does not exist.`);
	(error as { status?: number }).status = 404;
	return error;
}

/**
 * Google Drive stores files by immutable id inside real folders, while
 * Drive Bridge speaks path keys. Fs translates keys to ids
 * and caches the mapping.
 *
 * Limitation: cannot download a file with known key but not cached ID, this is
 * fine in current implementation (impossible to happen).
 */
export default class GdriveFs implements RootFs {
	/** Path key (`'/'`, `folder/`, `folder/note.md`) to Drive file id. */
	private readonly ids: StoreSync<string>;
	private readonly snapshots: ReturnType<typeof snapshotStore>;
	private readonly log: (line: string) => void;

	constructor(
		private readonly request: Request,
		private readonly options: GdriveFsOptions,
		memoryDB: GdriveDB,
		{ persistentDB, log }: { persistentDB?: SnapshotDB; log?: (line: string) => void } = {},
	) {
		this.snapshots = snapshotStore(persistentDB);
		this.log = log ?? (() => {});
		this.ids = memoryDB.getStore('gdriveIds');
		if (memoryDB.getMeta('gdriveIdsMarker') !== this.getUid()) {
			this.ids.clear();
			memoryDB.setMeta('gdriveIdsMarker', this.getUid());
		}
	}

	getUid(): string {
		return `gdrive~${this.options.userId}`;
	}

	private async requestOrThrow(url: string, params: RequestParam = {}): Promise<RequestResponse> {
		const response = await this.request(url, { ...params, throw: false });
		if (response.status >= 200 && response.status < 300) return response;
		const error = new Error(
			parseDriveError(response) ??
				`Google Drive request failed: ${response.status} ${params.method} ${url}`,
		);
		(error as { status?: number }).status = response.status;
		throw error;
	}

	private resolveId(key: string): string | undefined {
		if (key === '/') return ROOT_ID;
		return this.ids.get(key);
	}

	private dropCache(key: string): void {
		this.ids.delete(key);
		if (!isFolder(key)) return;
		for (const cachedKey of this.ids.keys())
			if (cachedKey.startsWith(key)) this.ids.delete(cachedKey);
	}

	/**
	 * Walks the path chain of `key` from root with fresh queries, ignoring and
	 * refreshing the cache along the way.
	 */
	private async resolveIdFresh(key: string): Promise<string | undefined> {
		if (key === '/') return ROOT_ID;
		const segments = key.split('/').filter((segment) => segment !== '');
		let parentId = ROOT_ID;
		let prefix = '';
		for (const [index, segment] of segments.entries()) {
			const last = index === segments.length - 1;
			const childKey = `${prefix}${segment}${last && !isFolder(key) ? '' : '/'}`;
			const folder = !last || isFolder(key);
			const response = await this.requestOrThrow(
				buildUrl(DRIVE_API, '/files', {
					fields: 'files(id)',
					pageSize: '1',
					q: `'${parentId}' in parents and name = '${escapeQuery(segment)}' and mimeType ${folder ? '=' : '!='} '${FOLDER_MIME}' and trashed = false`,
				}),
				{ method: 'GET' },
			);
			const id = response.json<DriveFileList>().files?.[0]?.id;
			if (!id) return undefined;
			this.ids.set(childKey, id);
			parentId = id;
			prefix = childKey;
		}
		return parentId;
	}

	/** Upload target for `key`, updating the existing file when present. */
	private uploadTarget(
		key: string,
		stat: FileStat,
		uploadType: 'multipart' | 'resumable',
	): { method: 'PATCH' | 'POST'; metadata: object; url: string } {
		const modifiedTime = new Date(stat.mtime).toISOString();
		const existing = this.resolveId(key);
		if (existing)
			return {
				metadata: { modifiedTime },
				method: 'PATCH',
				url: buildUrl(DRIVE_UPLOAD_API, `/files/${existing}`, {
					fields: WRITE_FIELDS,
					uploadType,
				}),
			};
		const parentId = this.resolveId(dirname(key));
		return {
			metadata: {
				mimeType: guessMimeType(basename(key)),
				modifiedTime,
				name: basename(key),
				parents: [parentId],
			},
			method: 'POST',
			url: buildUrl(DRIVE_UPLOAD_API, '/files', { fields: WRITE_FIELDS, uploadType }),
		};
	}

	async read(key: string): Promise<Binary> {
		const id = this.resolveId(key);
		if (id === undefined) throw notFoundError(key);
		const response = await this.requestOrThrow(
			buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' }),
			{ method: 'GET' },
		);
		return response.bytes();
	}

	readStream(key: string, { size }: FileStat) {
		const id = this.resolveId(key);
		if (id === undefined) throw notFoundError(key);
		const url = buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' });
		return createRangeReadStream({
			chunkSize,
			concurrency,
			requestRange: async (start, endInclusive) => {
				const response = await this.requestOrThrow(url, {
					headers: { Range: `bytes=${start}-${endInclusive}` },
					method: 'GET',
				});
				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const file = await singleUpload(
			{
				...this.uploadTarget(key, stat, 'multipart'),
				mimeType: guessMimeType(basename(key)),
				request: this.request,
			},
			value,
		);
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		const file = await resumableUpload(
			{
				...this.uploadTarget(key, stat, 'resumable'),
				request: this.request,
				size: stat.size,
			},
			value,
		);
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async delete(key: string): Promise<void> {
		const id = this.resolveId(key);
		if (id === undefined) return;
		const trashed = this.options.useTrash;
		try {
			await this.requestOrThrow(
				buildUrl(DRIVE_API, `/files/${id}`, trashed ? { fields: 'id' } : {}),
				trashed
					? {
							body: textToUint8Array(JSON.stringify({ trashed: true })),
							headers: { 'Content-Type': 'application/json; charset=UTF-8' },
							method: 'PATCH',
						}
					: { method: 'DELETE' },
			);
		} catch (error) {
			if (getStatus(error) !== 404) throw error;
		}
		this.dropCache(key);
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		const id = this.resolveId(oldKey);
		if (id === undefined) throw notFoundError(oldKey);
		const oldParentId = this.resolveId(dirname(oldKey));
		const newParentId = this.resolveId(dirname(newKey));
		if (!newParentId) throw new Error(`Parent not created when moving to "${newKey}"!`);
		const query: Record<string, string> = { fields: 'id' };
		if (oldParentId !== newParentId) {
			query.addParents = newParentId;
			if (oldParentId !== undefined) query.removeParents = oldParentId;
		}
		await this.requestOrThrow(buildUrl(DRIVE_API, `/files/${id}`, query), {
			body: textToUint8Array(JSON.stringify({ name: basename(newKey) })),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'PATCH',
		});
		this.dropCache(oldKey);
	}

	/** Drive folders always need an existing parent id, so missing parents are created regardless of `recursive`. */
	async mkdir(key: string, recursive: boolean): Promise<void> {
		const parent = dirname(key);
		let parentId = this.resolveId(parent);
		if (!parentId && recursive) {
			await this.mkdir(parent, true);
			parentId = this.resolveId(parent);
		}
		if (!parentId) throw new Error(`Parent is not created when creating "${key}"!`);
		const response = await this.requestOrThrow(
			buildUrl(DRIVE_API, '/files', { fields: 'id' }),
			{
				body: textToUint8Array(
					JSON.stringify({
						mimeType: FOLDER_MIME,
						name: basename(key),
						parents: [parentId],
					}),
				),
				headers: { 'Content-Type': 'application/json; charset=UTF-8' },
				method: 'POST',
			},
		);
		const created = response.json<DriveFile>();
		if (!created.id) throw new Error('Google Drive did not return an id for a created folder!');
		this.ids.set(key, created.id);
	}

	async stat(key: string): Promise<Stat> {
		const parentId = this.resolveId(dirname(key));
		if (!parentId) throw notFoundError(key);
		const url = buildUrl(DRIVE_API, '/files', {
			fields: `files(${FILE_FIELDS})`,
			orderBy: 'modifiedTime desc',
			pageSize: '1',
			q: `'${parentId}' in parents and name = '${escapeQuery(basename(key))}' and trashed = false`,
		});
		const response = await this.requestOrThrow(url, { method: 'GET' });
		const entry = response.json<DriveFileList>().files?.[0];
		if (!entry) throw notFoundError(key);
		return toFileStat(key, entry);
	}

	// When Drive Bridge calls `exists()`, the only possibility is that something is unexpected, don't trust cache here
	async exists(key: string): Promise<boolean> {
		return (await this.resolveIdFresh(key)) !== undefined;
	}

	private readonly getJson = async (url: string) =>
		(await this.requestOrThrow(url, { method: 'GET' })).json();

	/** Every visible Drive file, from the changes since the last scan when that is allowed. */
	private async listEverything(): Promise<Array<DriveFile>> {
		if (this.options.remoteScan !== 'changes') {
			this.log('Drive scan: full scan (setting).');
			return this.listAllFiles();
		}
		const { userId } = this.options;
		const snapshot = await this.snapshots.load();
		let reason = fullScanReason(snapshot, userId);
		if (snapshot && !reason)
			try {
				const { snapshot: next, changed } = await applyChanges(this.getJson, snapshot);
				await this.snapshots.save(next);
				this.log(`Drive scan: changes only (${changed} change(s)).`);
				return next.files;
			} catch {
				// An expired token or a failed page: the full scan below starts over.
				reason = 'changes could not be read';
			}
		this.log(`Drive scan: full scan (${reason}).`);
		const token = await getStartToken(this.getJson);
		const files = await this.listAllFiles();
		await this.snapshots.save({ files, scannedAt: Date.now(), token, userId });
		return files;
	}

	private async listAllFiles(): Promise<Array<DriveFile>> {
		const all: Array<DriveFile> = [];
		let pageToken: string | undefined;
		do {
			const query: Record<string, string> = {
				fields: `nextPageToken,files(${FILE_FIELDS})`,
				pageSize: String(PAGE_SIZE),
				q: 'trashed = false',
			};
			if (pageToken) query.pageToken = pageToken;
			const parsed = (await this.getJson(
				buildUrl(DRIVE_API, '/files', query),
			)) as DriveFileList;
			all.push(...(parsed.files ?? []));
			pageToken = parsed.nextPageToken;
		} while (pageToken);
		return all;
	}

	/**
	 * Fetches every visible file in one paginated query, then walks the tree
	 * under the requested key so the reporter can steer traversal.
	 */
	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const startId = this.resolveId(key) ?? (await this.resolveIdFresh(key));
		if (startId === undefined) throw notFoundError(key);
		const all = await this.listEverything();

		this.ids.clear();
		this.ids.set(key, startId);
		const childrenByParent = new Map<string, Array<DriveFile>>();
		for (const file of all) {
			const parent = file.parents?.[0];
			if (!parent) continue;
			const siblings = childrenByParent.get(parent);
			if (siblings) siblings.push(file);
			else childrenByParent.set(parent, [file]);
		}

		const results: Array<Stat> = [];
		const total = all.length;
		let completed = 0;
		const walk = async (folderId: string, prefix: string): Promise<void> => {
			for (const entry of dedupeChildren(childrenByParent.get(folderId) ?? [])) {
				const folder = entry.mimeType === FOLDER_MIME;
				const childKey = `${prefix}${entry.name}${folder ? '/' : ''}`;
				completed++;
				const verdict = await reporter({ completed, current: childKey, total });
				if (verdict === 'exclude') continue;
				this.ids.set(childKey, entry.id);
				if (folder) {
					results.push({ isDir: true, key: childKey });
					if (verdict === 'advance') await walk(entry.id, childKey);
				} else results.push(toFileStat(childKey, entry));
			}
		};
		await walk(startId, key === '/' ? '' : key);
		return results;
	}
}

/**
 * Drive allows duplicate names inside one folder; syncing needs one entry per
 * key, so the most recently modified file (or the first folder) wins.
 */
function dedupeChildren(entries: Array<DriveFile>): Array<DriveFile> {
	if (entries.length < 2) return entries;
	const byName = new Map<string, DriveFile>();
	for (const entry of entries) {
		const nameKey = `${entry.mimeType === FOLDER_MIME ? 'd' : 'f'}~${entry.name}`;
		const existing = byName.get(nameKey);
		if (!existing) {
			byName.set(nameKey, entry);
			continue;
		}
		if (
			entry.mimeType !== FOLDER_MIME &&
			Date.parse(entry.modifiedTime ?? '') > Date.parse(existing.modifiedTime ?? '')
		)
			byName.set(nameKey, entry);
	}
	return [...byName.values()];
}
