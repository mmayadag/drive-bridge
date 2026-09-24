import type { OptionsWithRemoteStat } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class RemoveRemote extends BaseTask<OptionsWithRemoteStat> {
	constructor(options: BaseTaskOptions & OptionsWithRemoteStat) {
		super(options, 'removeRemote');
	}

	async exec() {
		await this.remoteFs.delete(this.key);
		await this.record.delete(this.key);
	}
}
