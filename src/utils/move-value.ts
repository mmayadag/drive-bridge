import type { StoreAsync } from '@/shared/key-value-store';

export default async function moveValue({
	store,
	newKey,
	oldKey,
}: {
	store: StoreAsync;
	newKey: string;
	oldKey: string;
}): Promise<void> {
	const value = await store.get(oldKey);
	if (value !== undefined)
		await store.batch([
			{ key: newKey, type: 'set', value },
			{ key: oldKey, type: 'delete' },
		]);
}
