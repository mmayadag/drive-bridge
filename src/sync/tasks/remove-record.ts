import type { TaskOptions } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class RemoveRecord extends BaseTask {
	constructor(options: BaseTaskOptions & TaskOptions) {
		super(options, 'removeRecord');
	}

	async exec() {
		await this.record.delete(this.key);
	}
}
