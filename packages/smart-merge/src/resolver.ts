import type { ConflictResolver, DatabaseAsync, FileStat, Fs } from '@hesprs/sync-engine-sdk';
import { pipe } from '@hesprs/sync-engine-sdk';
import { textToUint8Array, uint8ArrayToText } from '@repo/shared/binary';
import type { MergeOptions } from './utils/merge';
import merge from './utils/merge';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

export default function smartMergeResolver(
	mergeOptions: MergeOptions,
	db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>,
	getNamespace: (localFs?: Fs, remoteFs?: Fs) => string,
): ConflictResolver {
	return async ({ local, remote, key, localFs, remoteFs, record }) => {
		const store = db.getStore(`base-text-${getNamespace(localFs, remoteFs)}`);
		const [localBuffer, remoteBuffer, baseText] = await Promise.all([
			localFs.read(key, local),
			remoteFs.read(key, remote),
			store.get(key),
		]);

		if (baseText !== undefined) {
			const localText = uint8ArrayToText(localBuffer);
			const remoteText = uint8ArrayToText(remoteBuffer);
			if (localText === remoteText) {
				await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
				return;
			}
			const mergedText = merge({ a: localText, b: remoteText, o: baseText }, mergeOptions);
			const mergedBuffer = textToUint8Array(mergedText);
			const mergedStat: FileStat = {
				isDir: false,
				key,
				mtime: 0,
				size: mergedBuffer.byteLength,
				uid: crypto.randomUUID(),
			};
			const [localUid, remoteUid] = await Promise.all([
				mergedText === localText
					? Promise.resolve(local.uid)
					: localFs.write(key, mergedBuffer, mergedStat),
				mergedText === remoteText
					? Promise.resolve(remote.uid)
					: remoteFs.write(key, mergedBuffer, mergedStat),
			]);
			await record.set(key, { isDir: false, local: localUid, remote: remoteUid });
			return;
		}

		if (local.mtime > remote.mtime) {
			const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
			if (!uid) return;
			await record.set(key, { isDir: false, local: local.uid, remote: uid });
		} else {
			const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
			if (!uid) return;
			await record.set(key, { isDir: false, local: uid, remote: remote.uid });
		}
	};
}
