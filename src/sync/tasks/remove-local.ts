import type { OptionsWithLocalStat } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class RemoveLocal extends BaseTask<OptionsWithLocalStat> {
	constructor(options: BaseTaskOptions & OptionsWithLocalStat) {
		super(options, 'removeLocal');
	}

	async exec() {
		await this.localFs.delete(this.key);
		await this.record.delete(this.key);
	}
}
