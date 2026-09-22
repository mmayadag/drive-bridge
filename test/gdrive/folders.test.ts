import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import { FOLDER_MIME } from '@/gdrive/api';
import { createFolder, isUsableFolderName, listFolders } from '@/gdrive/folders';

const { request } = testKit;

function response(value: unknown, status = 200) {
	return {
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
	};
}

test('lists subfolders across pages', async () => {
	const pages = [
		{ files: [{ id: '1', name: 'Alpha' }], nextPageToken: 'next' },
		{ files: [{ id: '2', name: 'Beta' }] },
	];
	const harness = request(() => response(pages.shift() ?? {}));

	expect(await listFolders(harness.request, 'root')).toStrictEqual([
		{ id: '1', name: 'Alpha' },
		{ id: '2', name: 'Beta' },
	]);
	expect(harness.calls).toHaveLength(2);
	const query = new URL(harness.calls[0]?.url ?? '').searchParams.get('q');
	expect(query).toBe(`'root' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`);
	expect(harness.calls[1]?.url).toContain('pageToken=next');
});

test('reports a failed listing', async () => {
	const harness = request(() => response({ error: { message: 'nope' } }, 403));
	let caught: unknown;
	try {
		await listFolders(harness.request, 'root');
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('Listing Drive folders failed');
});

test('creates a folder under the current one', async () => {
	const harness = request(() => response({ id: 'new', name: 'Vault' }));

	expect(await createFolder(harness.request, 'parent-id', 'Vault')).toStrictEqual({
		id: 'new',
		name: 'Vault',
	});
	const call = harness.calls[0];
	expect(call?.method).toBe('POST');
	expect(JSON.parse(String(call?.body))).toStrictEqual({
		mimeType: FOLDER_MIME,
		name: 'Vault',
		parents: ['parent-id'],
	});
});

test('rejects names that cannot be expressed as a path', () => {
	expect(isUsableFolderName('Vault')).toBe(true);
	expect(isUsableFolderName('2026 notes')).toBe(true);
	expect(isUsableFolderName('a/b')).toBe(false);
	expect(isUsableFolderName('  ')).toBe(false);
});
