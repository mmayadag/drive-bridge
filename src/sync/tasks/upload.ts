import { pipe } from '@/utils/pipe';
import type { OptionsWithLocalFileStat } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class Upload extends BaseTask<OptionsWithLocalFileStat> {
	constructor(options: BaseTaskOptions & OptionsWithLocalFileStat) {
		super(options, 'upload');
	}

	async exec() {
		const { local, record, remoteFs, localFs, key } = this;
		const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: local.uid, remote: uid });
	}
}
