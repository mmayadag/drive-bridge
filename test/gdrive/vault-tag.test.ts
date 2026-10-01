// The device-local vault-id tag helpers that don't need a full GdriveFs harness (#78, #228).

import { expect, test } from 'bun:test';
import { forgetVaultTag, getLocalVaultId } from '@/gdrive/vault-tag';

function fakeDB(initial?: string) {
	let value = initial;
	return {
		getMeta: () => Promise.resolve(value),
		getStore: () => ({}) as never,
		setMeta: (_key: 'gdriveVaultId', next: string) => {
			value = next;
			return Promise.resolve();
		},
	};
}

test('reads the stored id as-is', async () => {
	expect(await getLocalVaultId(fakeDB('vault-1'))).toBe('vault-1');
});

test('an unset id reads as undefined', async () => {
	expect(await getLocalVaultId(fakeDB())).toBeUndefined();
});

test('forgetting clears the id, read back as undefined', async () => {
	const db = fakeDB('vault-1');
	await forgetVaultTag(db);
	expect(await getLocalVaultId(db)).toBeUndefined();
});
