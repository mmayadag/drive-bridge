import type { Request } from '@/modules/registrar';
import { DRIVE_API, buildUrl } from './api';

/** Bytes used, and the limit; no limit for unlimited storage. */
export type Quota = { used: number; limit?: number };

const NEARLY_FULL_SHARE = 0.95;
const NEARLY_FULL_BYTES = 200 * 1024 ** 2;
/** At most one check a day on each device. */
export const QUOTA_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

type AboutQuota = { storageQuota?: { limit?: string; usage?: string } };

/** The account's storage quota, or undefined when Drive does not answer with one. */
export async function fetchQuota(request: Request): Promise<Quota | undefined> {
	const response = await request(
		buildUrl(DRIVE_API, '/about', { fields: 'storageQuota(limit,usage)' }),
		{ method: 'GET', throw: false },
	);
	if (response.status < 200 || response.status >= 300) return;
	const quota = response.json<AboutQuota>().storageQuota;
	const used = Number(quota?.usage);
	if (!Number.isFinite(used)) return;
	const limit = quota?.limit === undefined ? undefined : Number(quota.limit);
	return { limit: Number.isFinite(limit) ? limit : undefined, used };
}

/** Over 95% used, or under 200 MB left. Unlimited storage is never full. */
export function isNearlyFull({ used, limit }: Quota) {
	if (!limit) return false;
	return used / limit >= NEARLY_FULL_SHARE || limit - used < NEARLY_FULL_BYTES;
}

/** Sizes the way Google shows them: binary units, one decimal under 100. */
export function formatBytes(bytes: number) {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const shown =
		value < 100 && unit > 0 ? value.toFixed(1).replace(/\.0$/u, '') : Math.round(value);
	return `${shown} ${units[unit]}`;
}
