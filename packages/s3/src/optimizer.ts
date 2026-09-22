import type { OptimizerInput, OptimizerOutput } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import S3Fs, { BATCH_DELETE_MAX_KEYS } from './s3/fs';

export default function s3BatchDeleteOptimizer({
	atoms,
	fs,
}: OptimizerInput): OptimizerOutput | undefined {
	const original = digOriginal(fs);
	if (!(original instanceof S3Fs)) return undefined;
	const s3Fs = original;
	type DeleteAtom = Extract<(typeof atoms)[number], { type: 'delete' }>;
	const deleteAtoms = atoms.filter((a): a is DeleteAtom => a.type === 'delete');
	const otherAtoms = atoms.filter((a) => a.type !== 'delete');
	if (deleteAtoms.length === 0) return atoms;
	const batchGroups: Array<Array<DeleteAtom>> = [];
	for (let i = 0; i < deleteAtoms.length; i += BATCH_DELETE_MAX_KEYS)
		batchGroups.push(deleteAtoms.slice(i, i + BATCH_DELETE_MAX_KEYS));
	const batchAtoms = batchGroups.map((batch) => ({
		execute: async () => {
			const keys = batch.map((a) => a.key);
			try {
				const result = await s3Fs.batchDelete(keys);
				batch.forEach((atom) => {
					const status = result[atom.key];
					if (status === true) atom.resolve();
					else
						atom.reject(
							new Error(status ?? `S3 batch delete missing result for ${atom.key}.`),
						);
				});
			} catch (error) {
				const reason =
					error instanceof Error ? error : new Error(String(error), { cause: error });
				batch.forEach((atom) => atom.reject(reason));
			}
		},
		type: 'custom' as const,
	}));
	return [...otherAtoms, ...batchAtoms];
}
