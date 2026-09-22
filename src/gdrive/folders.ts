import type { Request } from '@/modules/registrar';
import { buildUrl, DRIVE_API, escapeQuery, FOLDER_MIME, parseDriveError } from './api';

export type DriveFolder = { id: string; name: string };

/**
 * Drive allows `/` in a name, but the base directory is stored as a path, so a folder
 * called `a/b` would be read as `b` inside `a`. Such folders cannot be used.
 */
export function isUsableFolderName(name: string): boolean {
	return name.trim() !== '' && !name.includes('/');
}

type FolderList = { files?: Array<DriveFolder>; nextPageToken?: string };

function fail(response: { status: number } & Record<string, unknown>, action: string): never {
	throw new Error(
		`${action} failed: ${parseDriveError(response as never) ?? `HTTP ${response.status}`}`,
	);
}

/** Subfolders of one folder, by name. `root` is the account's My Drive. */
export async function listFolders(request: Request, parentId: string): Promise<Array<DriveFolder>> {
	const folders: Array<DriveFolder> = [];
	let pageToken: string | undefined;
	do {
		const response = await request(
			buildUrl(DRIVE_API, '/files', {
				fields: 'files(id,name),nextPageToken',
				orderBy: 'name',
				pageSize: '100',
				q: `'${escapeQuery(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
				...(pageToken ? { pageToken } : {}),
			}),
			{ method: 'GET', throw: false },
		);
		if (response.status >= 300) fail(response, 'Listing Drive folders');
		const page = response.json<FolderList>();
		folders.push(...(page.files ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken);
	return folders;
}

export async function createFolder(
	request: Request,
	parentId: string,
	name: string,
): Promise<DriveFolder> {
	const response = await request(buildUrl(DRIVE_API, '/files', { fields: 'id,name' }), {
		body: JSON.stringify({ mimeType: FOLDER_MIME, name, parents: [parentId] }),
		contentType: 'application/json',
		method: 'POST',
		throw: false,
	});
	if (response.status >= 300) fail(response, 'Creating a Drive folder');
	return response.json<DriveFolder>();
}
