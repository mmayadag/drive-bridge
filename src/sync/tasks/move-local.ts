import moveValue from '@/utils/move-value';
import type { OptionsWithRemoteStatAndOldKey } from '../decision/interface';
import type { BaseTaskOptions } from './interface';
import { BaseTask } from './interface';

export default class MoveLocal extends BaseTask<OptionsWithRemoteStatAndOldKey> {
	constructor(options: BaseTaskOptions & OptionsWithRemoteStatAndOldKey) {
		super(options, 'moveLocal');
	}

	async exec() {
		const { key, oldKey } = this.options;
		await this.localFs.move(oldKey, key);
		await moveValue({ newKey: key, oldKey, store: this.record });
	}
}
