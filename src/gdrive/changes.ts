import type { StoreAsync } from '@/shared/key-value-store';
import type { DriveFile, DriveFileList } from './api';
import { DRIVE_API, FILE_FIELDS, FOLDER_MIME, buildUrl } from './api';

export type RemoteScan = 'full' | 'changes';

/** Every visible Drive file as of `token`, so the next scan only asks what changed since. */
export type Snapshot = {
	userId: string;
	token: string;
	scannedAt: number;
	files: Array<DriveFile>;
};

export type SnapshotDB = {
	getStore: (name: 'gdriveSnapshot') => StoreAsync<Snapshot>;
};

type Change = {
	changeType?: string;
	fileId?: string;
	removed?: boolean;
	file?: DriveFile & { trashed?: boolean };
};

type ChangeList = {
	changes?: Array<Change>;
	nextPageToken?: string;
	newStartPageToken?: string;
};

type Json = (url: string) => Promise<unknown>;

const PAGE_SIZE = 1000;
/** Changes only still lists everything once a day, to catch whatever the changes missed. */
export const FULL_SCAN_INTERVAL = 24 * 60 * 60 * 1000;
const SNAPSHOT_KEY = 'snapshot';

/** Taken before a full listing, so changes made while listing show up next time. */
export async function getStartToken(json: Json): Promise<string> {
	const { startPageToken } = (await json(buildUrl(DRIVE_API, '/changes/startPageToken'))) as {
		startPageToken?: string;
	};
	if (!startPageToken) throw new Error('Google Drive did not return a start page token!');
	return startPageToken;
}

/** The snapshot moved forward to now; files that were removed, trashed or lost go. */
export async function applyChanges(json: Json, snapshot: Snapshot): Promise<Snapshot> {
	const files = new Map(snapshot.files.map((file) => [file.id, file]));
	// A folder new to the snapshot, restored from the trash say, may bring files with no change of their own.
	const arrivedFolders: Array<string> = [];
	let pageToken = snapshot.token;
	for (;;) {
		const page = (await json(
			buildUrl(DRIVE_API, '/changes', {
				fields: `nextPageToken,newStartPageToken,changes(changeType,fileId,removed,file(${FILE_FIELDS},trashed))`,
				pageSize: String(PAGE_SIZE),
				pageToken,
			}),
		)) as ChangeList;
		for (const { changeType, fileId, removed, file } of page.changes ?? []) {
			// Shared drive changes carry no file of ours.
			if (changeType && changeType !== 'file') continue;
			const id = file?.id ?? fileId;
			if (!id) continue;
			if (removed || !file || file.trashed) files.delete(id);
			else {
				const { trashed: _, ...kept } = file;
				if (kept.mimeType === FOLDER_MIME && !files.has(id)) arrivedFolders.push(id);
				files.set(id, kept);
			}
		}
		if (page.newStartPageToken) {
			await addContents(json, files, arrivedFolders);
			return { ...snapshot, files: [...files.values()], token: page.newStartPageToken };
		}
		if (!page.nextPageToken) throw new Error('Google Drive ended the changes without a token!');
		pageToken = page.nextPageToken;
	}
}

async function addContents(json: Json, files: Map<string, DriveFile>, folders: Array<string>) {
	const queue = [...folders];
	for (let folder = queue.shift(); folder; folder = queue.shift()) {
		let pageToken: string | undefined;
		do {
			const query: Record<string, string> = {
				fields: `nextPageToken,files(${FILE_FIELDS})`,
				pageSize: String(PAGE_SIZE),
				q: `'${folder}' in parents and trashed = false`,
			};
			if (pageToken) query.pageToken = pageToken;
			const page = (await json(buildUrl(DRIVE_API, '/files', query))) as DriveFileList;
			for (const file of page.files ?? []) {
				if (file.mimeType === FOLDER_MIME && !files.has(file.id)) queue.push(file.id);
				files.set(file.id, file);
			}
			pageToken = page.nextPageToken;
		} while (pageToken);
	}
}

export function isUsable(snapshot: Snapshot | undefined, userId: string, now = Date.now()) {
	return (
		snapshot?.userId === userId &&
		now - snapshot.scannedAt < FULL_SCAN_INTERVAL &&
		now >= snapshot.scannedAt
	);
}

/** Losing the snapshot only costs a full scan, so storage errors never fail a sync. */
export function snapshotStore(db?: SnapshotDB) {
	const store = db?.getStore('gdriveSnapshot');
	return {
		load: () => store?.get(SNAPSHOT_KEY).catch(() => {}),
		save: (snapshot: Snapshot) => store?.set(SNAPSHOT_KEY, snapshot).catch(() => {}),
	};
}
