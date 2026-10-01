// Tags the vault's base folder in Drive `properties`, so a move or rename is found again
// instead of starting a fresh one (#78). The tag is a device-local id (`SnapshotDB`'s meta),
// never exported with settings: two devices of the same vault adopt whichever one got there
// first, while a folder tagged for a genuinely different vault is left alone.

import type { RequestParam, RequestResponse } from '@/modules/registrar';
import { textToUint8Array } from '@/shared/binary';
import { getMessage } from '@/shared/error';
import type { DriveFileList } from './api';
import type { SnapshotDB } from './changes';
import { DRIVE_API, FOLDER_MIME, buildUrl, escapeQuery } from './api';

const VAULT_TAG_KEY = 'driveBridgeVaultId';

export type RequestOrThrow = (url: string, params?: RequestParam) => Promise<RequestResponse>;

async function getFolderTag(
	requestOrThrow: RequestOrThrow,
	folderId: string,
): Promise<string | undefined> {
	const response = await requestOrThrow(
		buildUrl(DRIVE_API, `/files/${folderId}`, { fields: 'properties' }),
		{
			method: 'GET',
		},
	);
	return response.json<{ properties?: Record<string, string> }>().properties?.[VAULT_TAG_KEY];
}

// Best-effort: a folder the user cannot edit (shared, viewer) must not fail the sync.
async function setFolderTag(
	requestOrThrow: RequestOrThrow,
	folderId: string,
	vaultId: string,
	log: (line: string) => void,
): Promise<void> {
	try {
		await requestOrThrow(buildUrl(DRIVE_API, `/files/${folderId}`, { fields: 'id' }), {
			body: textToUint8Array(JSON.stringify({ properties: { [VAULT_TAG_KEY]: vaultId } })),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'PATCH',
		});
	} catch (error) {
		log(`Could not tag the vault folder: ${getMessage(error)}`);
	}
}

/** The folder tagged with `vaultId`, anywhere in Drive; `trashed` when only a trashed one is. */
export async function findFolderByTag(
	requestOrThrow: RequestOrThrow,
	vaultId: string,
): Promise<{ id: string; trashed: boolean } | undefined> {
	const search = async (trashed: boolean) => {
		const response = await requestOrThrow(
			buildUrl(DRIVE_API, '/files', {
				fields: 'files(id)',
				pageSize: '1',
				q: `properties has { key='${VAULT_TAG_KEY}' and value='${escapeQuery(vaultId)}' } and mimeType = '${FOLDER_MIME}' and trashed = ${trashed}`,
			}),
			{ method: 'GET' },
		);
		return response.json<DriveFileList>().files?.[0]?.id;
	};
	const id = await search(false);
	if (id) return { id, trashed: false };
	const trashedId = await search(true);
	return trashedId ? { id: trashedId, trashed: true } : undefined;
}

// New vault, new folder: nothing to adopt or reconcile, just tag it. Re-reading afterwards
// means two devices racing to tag the same new folder both end up with the one that actually
// landed, instead of each keeping its own and later seeing a mismatch neither caused.
export async function tagNewVault(
	requestOrThrow: RequestOrThrow,
	folderId: string,
	log: (line: string) => void,
): Promise<string> {
	const vaultId = crypto.randomUUID();
	await setFolderTag(requestOrThrow, folderId, vaultId, log);
	return (await getFolderTag(requestOrThrow, folderId)) ?? vaultId;
}

/** Checks the folder already found by path against this device's id, adopting or tagging it. */
export async function reconcileTag(
	requestOrThrow: RequestOrThrow,
	folderId: string,
	localId: string | undefined,
	{ persistentDB, log }: { persistentDB: SnapshotDB; log: (line: string) => void },
): Promise<void> {
	const remoteId = await getFolderTag(requestOrThrow, folderId);
	if (localId === undefined) {
		await persistentDB.setMeta(
			'gdriveVaultId',
			remoteId ?? (await tagNewVault(requestOrThrow, folderId, log)),
		);
		return;
	}
	if (remoteId === undefined) {
		await setFolderTag(requestOrThrow, folderId, localId, log);
		return;
	}
	if (remoteId !== localId)
		throw new Error(
			'This Drive folder is tagged for a different vault, so Drive Bridge will not use it. ' +
				'Point the base directory at a different folder.',
		);
}

/** This device's tag for a newly created folder: its own id, or a fresh one. */
export async function tagCreatedFolder(
	requestOrThrow: RequestOrThrow,
	folderId: string,
	localId: string | undefined,
	log: (line: string) => void,
): Promise<string> {
	if (localId) {
		await setFolderTag(requestOrThrow, folderId, localId, log);
		return localId;
	}
	return tagNewVault(requestOrThrow, folderId, log);
}
