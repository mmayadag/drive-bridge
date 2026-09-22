import { pipe } from '@/utils/pipe';
import type { ConflictResolverPayload } from '../tasks/interface';

export default async function keepRemoteResolver({
	remote,
	key,
	localFs,
	remoteFs,
	record,
}: ConflictResolverPayload) {
	const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
	if (!uid) return;
	await record.set(key, { isDir: false, local: uid, remote: remote.uid });
}
