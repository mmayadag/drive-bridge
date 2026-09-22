import type { Fs } from '@/fs/interface';
import type { DatabaseAsync } from '@/shared/key-value-store';
import type { ConflictResolver } from '@/sync';
import type { FileStat } from '@/types';
import { textToUint8Array, uint8ArrayToText } from '@/shared/binary';
import renameAndKeepBothResolver from '@/sync/conflict-resolve/rename-and-keep-both';
import type { MergeOptions } from './utils/merge';
import merge from './utils/merge';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

export default function smartMergeResolver(
	mergeOptions: MergeOptions,
	db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>,
	getNamespace: (localFs?: Fs, remoteFs?: Fs) => string,
): ConflictResolver {
	return async (payload) => {
		const { local, remote, key, localFs, remoteFs, record } = payload;
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

		// Without a common base there is nothing to merge against.
		// Keep both versions rather than letting the newer one overwrite the other.
		await renameAndKeepBothResolver(payload);
	};
}
