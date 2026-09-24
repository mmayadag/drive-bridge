import type { RecordStatsMap, StatsMap } from '@/types';

/** The key and the folders above it, as sync keys (`a/`, `a/b/`, `a/b/note.md`). */
export function keyWithParents(key: string): Set<string> {
	const keys = new Set([key]);
	const parts = key.split('/');
	for (let i = 1; i < parts.length; i++) keys.add(`${parts.slice(0, i).join('/')}/`);
	return keys;
}

/**
 * Keeps only one file and its parent folders in the listings and the records, so a
 * single-file sync plans that file alone and leaves every other record untouched.
 */
export function narrowTo(
	key: string,
	maps: { localStats: StatsMap; remoteStats: StatsMap; records: RecordStatsMap },
) {
	const keep = keyWithParents(key);
	for (const map of [maps.localStats, maps.remoteStats, maps.records])
		for (const existing of map.keys()) if (!keep.has(existing)) map.delete(existing);
}
