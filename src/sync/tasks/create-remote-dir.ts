import type { OptionsWithLocalFolderStat } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class CreateRemoteDir extends BaseTask<OptionsWithLocalFolderStat> {
	constructor(options: BaseTaskOptions & OptionsWithLocalFolderStat) {
		super(options, 'createRemoteDir');
	}

	async exec() {
		await this.remoteFs.mkdir(this.key);
		await this.record.set(this.key, { isDir: true });
	}
}
