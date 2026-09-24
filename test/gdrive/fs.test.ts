import testKit from '$/support/test-kit';
import { beforeEach, expect, test } from 'bun:test';
import type { GdriveDB } from '@/gdrive/fs';
import type { RequestParam, RequestResponse } from '@/modules/registrar';
import type { Binary, MaybePromise } from '@/types';
import { DRIVE_API, DRIVE_UPLOAD_API, FOLDER_MIME } from '@/gdrive/api';
import GdriveFs from '@/gdrive/fs';
import { openMemoryDB } from '@/shared/key-value-store';

const { bytes, file, request } = testKit;
const db: GdriveDB = openMemoryDB<{ gdriveIds: string }, { gdriveIdsMarker?: string }>(
	'gdrive-fs-test',
);

/** What a promise rejected with, or undefined when it resolved. */
const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => {},
		(error: unknown) => error as Error & { status?: number },
	);

type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;

function response(value: unknown = {}, status = 200, headers: Record<string, string> = {}) {
	const body = new TextEncoder().encode(JSON.stringify(value));
	return {
		bytes: () => body,
		headers,
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
		text: () => new TextDecoder().decode(body),
	};
}

function binaryResponse(value: Binary, status = 200) {
	return { ...response({}, status), bytes: () => value };
}

function createFs(handler: Control) {
	const harness = request(handler);
	return {
		calls: harness.calls,
		fs: new GdriveFs(harness.request, { useTrash: true, userId: 'user-1' }, db),
	};
}

beforeEach(() => {
	db.clearStores();
	db.setMeta('gdriveIdsMarker', undefined);
});

test('writes and reads a file through Drive multipart upload', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (url.startsWith(DRIVE_UPLOAD_API) && params.method === 'POST')
			return response({ id: 'file-1', md5Checksum: 'drive-uid' });
		if (url === `${DRIVE_API}/files/file-1?alt=media`) return binaryResponse(bytes('hello'));
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	const stat = file('note.md', { mtime: 1_700_000_000_000, size: 5 });
	expect(await fs.write('note.md', bytes('hello'), stat)).toBe('drive-uid');
	expect(await fs.read('note.md')).toStrictEqual(bytes('hello'));
	expect(calls.map(({ method }) => method)).toStrictEqual(['POST', 'GET']);
	expect(calls[0]?.url).toContain('uploadType=multipart');
	expect(calls[0]?.headers?.['Content-Type']).toContain('multipart/related');
	const body = new TextDecoder().decode(calls[0]?.body as Binary);
	expect(body).toContain('"name":"note.md"');
	expect(body).toMatch(/hello\r\n--drive-bridge-[0-9a-f-]+--$/u);
});

test('creates folders, lists visible descendants, and honors excluded subtrees', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST' && url.startsWith(`${DRIVE_API}/files`))
			return response({ id: 'folder-1' });
		return response({
			files: [
				{ id: 'folder-1', mimeType: FOLDER_MIME, name: 'notes', parents: ['root'] },
				{
					id: 'file-1',
					md5Checksum: 'uid',
					mimeType: 'text/markdown',
					modifiedTime: new Date(1000).toISOString(),
					name: 'note.md',
					parents: ['folder-1'],
					size: '5',
				},
			],
		});
	});

	await fs.mkdir('notes/', true);
	const result = await fs.list('/', ({ current }) =>
		current === 'notes/' ? 'include' : 'advance',
	);
	expect(result).toStrictEqual([{ isDir: true, key: 'notes/' }]);
	expect(calls[0]?.method).toBe('POST');
	expect(new TextDecoder().decode(calls[0]?.body as Binary)).toContain(FOLDER_MIME);
});

test('moves a cached file with Drive native rename', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST' && url.startsWith(DRIVE_UPLOAD_API))
			return response({ id: 'file-1' });
		if (params.method === 'PATCH') return response({ id: 'file-1' });
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	await fs.write('old.md', bytes('x'), file('old.md', { size: 1 }));
	await fs.move('old.md', 'new.md');
	const move = calls.find((call) => call.method === 'PATCH');
	expect(move?.url).toContain('/files/file-1');
	expect(new TextDecoder().decode(move?.body as Binary)).toBe('{"name":"new.md"}');
});

test('uploads streamed files in ascending contiguous chunks over one resumable session', async () => {
	const chunkSize = 8 * 1024 ** 2; // Fixed upload chunk size, independent of SDK settings.
	const location = 'https://upload.googleapis.com/session/1';
	let puts = 0;
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST') return response({}, 200, { location });
		if (params.method === 'PUT')
			return ++puts < 3
				? response({}, 308)
				: response({ id: 'file-1', md5Checksum: 'drive-uid' });
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	const pieces = [
		bytes('a'.repeat(1000)),
		new Uint8Array(chunkSize).fill(1),
		new Uint8Array(chunkSize).fill(2),
		bytes('b'.repeat(5)),
	];
	const total = pieces.reduce((sum, piece) => sum + piece.byteLength, 0);
	const stream = new ReadableStream<Binary>({
		start(controller) {
			pieces.forEach((piece) => controller.enqueue(piece));
			controller.close();
		},
	});

	expect(
		await fs.writeStream('big.bin', stream, file('big.bin', { mtime: 1, size: total })),
	).toBe('drive-uid');
	const ranges = calls
		.filter((call) => call.method === 'PUT')
		.map((call) => call.headers?.['Content-Range']);
	expect(ranges).toStrictEqual([
		`bytes 0-${chunkSize - 1}/${total}`,
		`bytes ${chunkSize}-${chunkSize * 2 - 1}/${total}`,
		`bytes ${chunkSize * 2}-${total - 1}/${total}`,
	]);
});

const note = (id: string, name: string, parent: string, modified = 1000) => ({
	id,
	md5Checksum: `${id}-uid`,
	mimeType: 'text/markdown',
	modifiedTime: new Date(modified).toISOString(),
	name,
	parents: [parent],
	size: '1',
});
const folder = (id: string, name: string, parent: string) => ({
	id,
	mimeType: FOLDER_MIME,
	name,
	parents: [parent],
});

test('a missing key is a 404, not a crash', async () => {
	const { fs } = createFs(() => response({ files: [] }));
	for (const run of [
		() => fs.read('nope.md'),
		() => fs.move('nope.md', 'other.md'),
		() => fs.stat('missing/nope.md'),
		() => fs.stat('nope.md'),
	])
		expect((await failure(run()))?.status).toBe(404);
	expect(() => fs.readStream('nope.md', file('nope.md', { size: 1 }))).toThrow('does not exist');
	expect((await failure(fs.list('missing/', () => 'advance')))?.status).toBe(404);
});

test('deleting moves to the trash by default, or deletes for good', async () => {
	const listing = response({ files: [note('file-1', 'a.md', 'root')] });
	for (const useTrash of [true, false]) {
		const harness = request((_url, params) =>
			params.method === 'GET' ? listing : response({ id: 'file-1' }),
		);
		const fs = new GdriveFs(harness.request, { useTrash, userId: 'user-1' }, db);
		await fs.list('/', () => 'advance');
		await fs.delete('a.md');
		const call = harness.calls.at(-1);
		expect(call?.method).toBe(useTrash ? 'PATCH' : 'DELETE');
		if (useTrash)
			expect(new TextDecoder().decode(call?.body as Binary)).toBe('{"trashed":true}');
		// The id is forgotten, so a second delete sends nothing.
		await fs.delete('a.md');
		expect(harness.calls.at(-1)).toBe(call);
	}
});

test('deleting a file Drive already lost is fine; other errors are not', async () => {
	let status = 404;
	const { fs } = createFs((_url, params) =>
		params.method === 'GET'
			? response({
					files: [
						folder('folder-1', 'notes', 'root'),
						note('file-1', 'a.md', 'folder-1'),
					],
				})
			: response({ error: { message: 'Nope' } }, status),
	);
	await fs.list('/', () => 'advance');
	await fs.delete('notes/');
	// Deleting the folder also forgot the files inside it.
	expect((await failure(fs.read('notes/a.md')))?.status).toBe(404);
	await fs.list('/', () => 'advance');
	status = 403;
	expect((await failure(fs.delete('notes/a.md')))?.status).toBe(403);
});

test('moving to another folder changes its parents', async () => {
	const { calls, fs } = createFs((_url, params) =>
		params.method === 'GET'
			? response({
					files: [
						folder('folder-a', 'a', 'root'),
						folder('folder-b', 'b', 'root'),
						note('file-1', 'x.md', 'folder-a'),
					],
				})
			: response({ id: 'file-1' }),
	);
	await fs.list('/', () => 'advance');
	await fs.move('a/x.md', 'b/y.md');
	const url = new URL(calls.at(-1)?.url ?? '');
	expect(url.searchParams.get('addParents')).toBe('folder-b');
	expect(url.searchParams.get('removeParents')).toBe('folder-a');
	await fs.list('/', () => 'advance');
	expect((await failure(fs.move('a/x.md', 'c/y.md')))?.message).toContain('Parent not created');
});

test('exists asks Drive along the path instead of trusting the cache', async () => {
	const { calls, fs } = createFs((url) => {
		const query = new URL(url).searchParams.get('q') ?? '';
		if (query.includes("'root' in parents and name = 'notes'"))
			return response({ files: [{ id: 'folder-1' }] });
		if (query.includes("'folder-1' in parents and name = 'a.md'"))
			return response({ files: [{ id: 'file-1' }] });
		return response({ files: [] });
	});
	expect(await fs.exists('/')).toBe(true);
	expect(await fs.exists('notes/a.md')).toBe(true);
	expect(await fs.exists('notes/b.md')).toBe(false);
	expect(await fs.exists('gone/a.md')).toBe(false);
	expect(calls).toHaveLength(5);
	// What exists found is cached, so it can be read.
	expect(new URL(calls[1]?.url ?? '').searchParams.get('q')).toContain("mimeType != '");
	expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toContain(
		`mimeType = '${FOLDER_MIME}'`,
	);
});

test('stat finds the newest file with that name in its folder', async () => {
	const { calls, fs } = createFs(() =>
		response({ files: [note('file-1', 'a.md', 'root', 5000)] }),
	);
	expect(await fs.stat('a.md')).toMatchObject({ isDir: false, key: 'a.md', mtime: 5000 });
	expect(new URL(calls[0]?.url ?? '').searchParams.get('orderBy')).toBe('modifiedTime desc');
});

test('reads a large file in ranges', async () => {
	const { calls, fs } = createFs((url, params) =>
		params.method === 'GET' && url.includes('alt=media')
			? binaryResponse(bytes('abc'))
			: response({ files: [note('file-1', 'a.md', 'root')] }),
	);
	await fs.list('/', () => 'advance');
	const reader = fs.readStream('a.md', file('a.md', { size: 3 })).getReader();
	expect((await reader.read()).value).toStrictEqual(bytes('abc'));
	expect(calls.at(-1)?.headers?.Range).toBe('bytes=0-2');
});

test('duplicate names on Drive list once: the newest file, the first folder', async () => {
	const { fs } = createFs(() =>
		response({
			files: [
				note('old', 'a.md', 'root', 1000),
				note('new', 'a.md', 'root', 9000),
				note('older', 'a.md', 'root', 500),
				folder('folder-1', 'a', 'root'),
				folder('folder-2', 'a', 'root'),
				{ id: 'orphan', name: 'lost.md' },
			],
		}),
	);
	const result = await fs.list('/', () => 'include');
	expect(
		result.map((stat) => ('mtime' in stat ? `${stat.key}@${stat.mtime}` : stat.key)),
	).toStrictEqual(['a.md@9000', 'a/']);
});

test('listing follows every page', async () => {
	const { calls, fs } = createFs((url) =>
		new URL(url).searchParams.get('pageToken')
			? response({ files: [note('file-2', 'b.md', 'root')] })
			: response({ files: [note('file-1', 'a.md', 'root')], nextPageToken: 'next' }),
	);
	expect((await fs.list('/', () => 'advance')).map((stat) => stat.key)).toStrictEqual([
		'a.md',
		'b.md',
	]);
	expect(calls).toHaveLength(2);
});

test('writing over a known file updates it in place', async () => {
	const { calls, fs } = createFs((_url, params) =>
		params.method === 'GET'
			? response({ files: [note('file-1', 'a.md', 'root')] })
			: response({ id: 'file-1' }),
	);
	await fs.list('/', () => 'advance');
	// Without an md5 from Drive, the upload's time and size stand in for it.
	expect(await fs.write('a.md', bytes('x'), file('a.md', { mtime: 7, size: 1 }))).toBe('7~1');
	expect(calls.at(-1)?.method).toBe('PATCH');
	expect(calls.at(-1)?.url).toContain('/files/file-1');
});

test('folder creation fails clearly without a parent or an id', async () => {
	const { fs } = createFs(() => response({}));
	expect((await failure(fs.mkdir('a/b/', false)))?.message).toContain('Parent is not created');
	expect((await failure(fs.mkdir('a/', false)))?.message).toContain('did not return an id');
});

test('a Drive error carries its status and message', async () => {
	const { fs } = createFs(() => response({ error: { message: 'Rate limit exceeded' } }, 429));
	const error = await failure(fs.stat('a.md'));
	expect(error).toMatchObject({ status: 429 });
	expect(String(error)).toContain('Rate limit');
});

test('changes only lists everything once, then asks only what changed', async () => {
	const saved = new Map<string, unknown>();
	const persistentDB = {
		getStore: () =>
			({
				get: (key: string) => Promise.resolve(saved.get(key)),
				set: (key: string, value: unknown) => Promise.resolve(void saved.set(key, value)),
			}) as never,
	};
	let changesFail = false;
	const harness = request((url) => {
		const { pathname } = new URL(url);
		if (pathname.endsWith('/changes/startPageToken')) return response({ startPageToken: 't1' });
		if (pathname.endsWith('/changes'))
			return changesFail
				? response({ error: { message: 'Invalid page token' } }, 404)
				: response({
						changes: [{ file: note('file-2', 'b.md', 'root'), fileId: 'file-2' }],
						newStartPageToken: 't2',
					});
		return response({ files: [note('file-1', 'a.md', 'root')] });
	});
	const options = { remoteScan: 'changes' as const, useTrash: true, userId: 'user-1' };
	const fs = new GdriveFs(harness.request, options, db, persistentDB);
	const keys = async () => (await fs.list('/', () => 'advance')).map((stat) => stat.key);
	const paths = () =>
		harness.calls.splice(0).map((call) => new URL(call.url).pathname.split('/v3')[1]);

	expect(await keys()).toStrictEqual(['a.md']);
	expect(paths()).toStrictEqual(['/changes/startPageToken', '/files']);

	expect(await keys()).toStrictEqual(['a.md', 'b.md']);
	expect(paths()).toStrictEqual(['/changes']);

	// A token Drive no longer knows means starting over with a full scan.
	changesFail = true;
	expect(await keys()).toStrictEqual(['a.md']);
	expect(paths()).toStrictEqual(['/changes', '/changes/startPageToken', '/files']);

	// Full scan ignores the snapshot.
	options.remoteScan = 'full' as never;
	await keys();
	expect(paths()).toStrictEqual(['/files']);
});
