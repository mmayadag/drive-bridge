import { expect, test } from 'bun:test';
import type { DriveFile } from '@/gdrive/api';
import type { Snapshot } from '@/gdrive/changes';
import { FOLDER_MIME } from '@/gdrive/api';
import {
	FULL_SCAN_INTERVAL,
	applyChanges,
	getStartToken,
	isUsable,
	snapshotStore,
} from '@/gdrive/changes';

/** What a promise rejected with, or undefined when it resolved. */
const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => {},
		(error: unknown) => error as Error,
	);

const note = (id: string, parent = 'root', extra: object = {}): DriveFile => ({
	id,
	mimeType: 'text/markdown',
	name: `${id}.md`,
	parents: [parent],
	...extra,
});
const folder = (id: string, parent = 'root'): DriveFile => ({
	id,
	mimeType: FOLDER_MIME,
	name: id,
	parents: [parent],
});
const snapshot = (files: Array<DriveFile>): Snapshot => ({
	files,
	scannedAt: 1000,
	token: 't1',
	userId: 'user-1',
});

/** Answers by path and page token; records every url asked for. */
function drive(pages: Record<string, unknown>) {
	const urls: Array<string> = [];
	const json = (url: string) => {
		urls.push(url);
		const { pathname, searchParams } = new URL(url);
		const key = `${pathname.replace('/drive/v3', '')}?${searchParams.get('pageToken') ?? searchParams.get('q') ?? ''}`;
		if (!(key in pages)) return Promise.reject(new Error(`Unexpected ${key}`));
		return Promise.resolve(pages[key]);
	};
	return { json, urls };
}

test('changes add, update and drop files, over every page', async () => {
	const { json } = drive({
		'/changes?t1': {
			changes: [
				{ file: note('new'), fileId: 'new' },
				{ file: note('kept', 'root', { md5Checksum: 'v2' }), fileId: 'kept' },
				{ fileId: 'gone', removed: true },
			],
			nextPageToken: 't2',
		},
		'/changes?t2': {
			changes: [
				{ file: { ...note('binned'), trashed: true }, fileId: 'binned' },
				{ changeType: 'drive', fileId: 'shared-drive' },
				{ fileId: 'no-file' },
			],
			newStartPageToken: 't3',
		},
	});
	const next = await applyChanges(
		json,
		snapshot([note('kept'), note('gone'), note('binned'), note('no-file'), note('same')]),
	);
	expect(next.token).toBe('t3');
	expect(next.scannedAt).toBe(1000);
	expect(next.files.map((file) => file.id).toSorted()).toStrictEqual(['kept', 'new', 'same']);
	expect(next.files.find((file) => file.id === 'kept')?.md5Checksum).toBe('v2');
	expect(next.files.some((file) => 'trashed' in file)).toBe(false);
});

test('a folder new to the snapshot brings its whole contents', async () => {
	const { json } = drive({
		'/changes?t1': {
			changes: [{ file: folder('restored'), fileId: 'restored' }],
			newStartPageToken: 't2',
		},
		"/files?'inner' in parents and trashed = false": { files: [note('c', 'inner')] },
		"/files?'restored' in parents and trashed = false": {
			files: [note('a', 'restored'), folder('inner', 'restored')],
			nextPageToken: 'p2',
		},
		'/files?p2': { files: [note('b', 'restored')] },
	});
	const next = await applyChanges(json, snapshot([]));
	expect(next.files.map((file) => file.id).toSorted()).toStrictEqual([
		'a',
		'b',
		'c',
		'inner',
		'restored',
	]);
});

test('a folder already known is not listed again', async () => {
	const { json, urls } = drive({
		'/changes?t1': {
			changes: [{ file: folder('known'), fileId: 'known' }],
			newStartPageToken: 't2',
		},
	});
	await applyChanges(json, snapshot([folder('known'), note('x', 'known')]));
	expect(urls).toHaveLength(1);
});

test('changes that end without a token fail, so a full scan takes over', async () => {
	const { json } = drive({ '/changes?t1': { changes: [] } });
	expect((await failure(applyChanges(json, snapshot([]))))?.message).toContain('without a token');
});

test('the start token comes from Drive or the scan fails', async () => {
	expect(
		await getStartToken(drive({ '/changes/startPageToken?': { startPageToken: 's' } }).json),
	).toBe('s');
	expect(
		(await failure(getStartToken(drive({ '/changes/startPageToken?': {} }).json)))?.message,
	).toContain('start page token');
});

test('a snapshot is used for a day, for the same account only', () => {
	const taken = snapshot([]);
	expect(isUsable(taken, 'user-1', 1000 + FULL_SCAN_INTERVAL - 1)).toBe(true);
	expect(isUsable(taken, 'user-1', 1000 + FULL_SCAN_INTERVAL)).toBe(false);
	expect(isUsable(taken, 'user-2', 2000)).toBe(false);
	expect(isUsable(undefined, 'user-1', 2000)).toBe(false);
	// A clock set back is not trusted either.
	expect(isUsable(taken, 'user-1', 500)).toBe(false);
});

test('a multi-page changes list is followed to its end token', async () => {
	const { json, urls } = drive({
		'/changes?c2': {
			changes: [{ file: note('new'), fileId: 'new' }],
			newStartPageToken: 't2',
		},
		'/changes?t1': {
			changes: [],
			nextPageToken: 'c2',
		},
	});
	const next = await applyChanges(json, snapshot([]));

	expect(urls).toHaveLength(2);
	expect(urls[0]).toContain('pageToken=t1');
	expect(urls[1]).toContain('pageToken=c2');
	expect(next.token).toBe('t2');
	expect(next.files.map((file) => file.id)).toStrictEqual(['new']);
});

test('storage errors only cost a full scan', async () => {
	const failing = {
		getStore: () =>
			({
				get: () => Promise.reject(new Error('quota')),
				set: () => Promise.reject(new Error('quota')),
			}) as never,
	};
	const store = snapshotStore(failing);
	expect(await store.load()).toBeUndefined();
	expect(await store.save(snapshot([]))).toBeUndefined();
	expect(await snapshotStore().load()).toBeUndefined();
});
