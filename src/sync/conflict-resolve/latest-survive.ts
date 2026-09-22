import { pipe } from '@/utils/pipe';
import type { ConflictResolverPayload } from '../tasks/interface';

export default async function latestSurviveResolver({
	local,
	record,
	remote,
	localFs,
	remoteFs,
	key,
}: ConflictResolverPayload) {
	if (local.mtime > remote.mtime) {
		const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: local.uid, remote: uid });
	} else {
		const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: uid, remote: remote.uid });
	}
}
