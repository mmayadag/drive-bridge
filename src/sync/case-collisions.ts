import type { RecordStatsMap, StatsMap } from '@/types';
import { stripEndSlash } from '@/shared/path';

/**
 * How a case-insensitive file system (macOS, Windows, iOS) compares two names. Upper-casing
 * the NFC form errs towards treating names as equal: a false match only leaves two files out
 * of a sync with a notice, a missed one lets one file overwrite the other. A locale-aware fold
 * would not: Turkish rules keep `I` and `i` apart, which no file system does.
 */
export function foldName(key: string): string {
	return stripEndSlash(key).normalize('NFC').toUpperCase();
}

/**
 * Drive keeps `Note.md` and `note.md` (or an NFC and an NFD `café.md`) apart; written to a
 * case-insensitive vault, one would replace the other. Every such group, and everything under
 * a colliding folder, is left out of this sync on both sides and in the records, so nothing is
 * downloaded over, uploaded or deleted. The records themselves stay stored. Returns each group
 * once, outermost only, for the notice.
 */
export function leaveOutCaseCollisions(maps: {
	localStats: StatsMap;
	remoteStats: StatsMap;
	records: RecordStatsMap;
}): Array<Array<string>> {
	const byFold = new Map<string, Array<string>>();
	for (const key of maps.remoteStats.keys()) {
		const fold = foldName(key);
		const group = byFold.get(fold);
		if (group) group.push(key);
		else byFold.set(fold, [key]);
	}
	const collided = [...byFold].filter(([, keys]) => keys.length > 1);
	if (collided.length === 0) return [];

	const folds = collided.map(([fold]) => fold);
	const under = (fold: string, other: string) => fold.startsWith(`${other}/`);
	const hit = (key: string) => {
		const fold = foldName(key);
		return folds.some((other) => fold === other || under(fold, other));
	};
	for (const map of [maps.localStats, maps.remoteStats, maps.records])
		for (const key of map.keys()) if (hit(key)) map.delete(key);

	return collided
		.filter(([fold]) => !folds.some((other) => under(fold, other)))
		.map(([, keys]) => keys.toSorted());
}
