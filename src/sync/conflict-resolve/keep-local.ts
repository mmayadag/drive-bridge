import { pipe } from '@/utils/pipe';
import type { ConflictResolverPayload } from '../tasks/interface';

export default async function keepLocalResolver({
	key,
	localFs,
	remoteFs,
	record,
	local,
}: ConflictResolverPayload) {
	const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
	if (!uid) return;
	await record.set(key, { isDir: false, local: local.uid, remote: uid });
}
