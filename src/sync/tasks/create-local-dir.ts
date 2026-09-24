import type { OptionsWithRemoteFolderStat } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class CreateLocalDir extends BaseTask<OptionsWithRemoteFolderStat> {
	constructor(options: BaseTaskOptions & OptionsWithRemoteFolderStat) {
		super(options, 'createLocalDir');
	}

	async exec() {
		await this.localFs.mkdir(this.key);
		await this.record.set(this.key, { isDir: true });
	}
}
