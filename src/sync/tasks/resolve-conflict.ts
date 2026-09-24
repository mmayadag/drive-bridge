import type { OptionsWithBothFileStats } from '../decision/interface';
import type { BaseTaskOptions, ConflictResolver } from './interface';
import { BaseTask } from './interface';

type ResolveConflictOptions = OptionsWithBothFileStats & { resolver: ConflictResolver };

export default class ResolveConflict extends BaseTask<ResolveConflictOptions> {
	constructor(options: BaseTaskOptions & ResolveConflictOptions) {
		super(options, 'resolveConflict');
	}

	exec = () =>
		this.options.resolver({
			key: this.key,
			local: this.local,
			localFs: this.localFs,
			record: this.record,
			remote: this.remote,
			remoteFs: this.remoteFs,
		});
}
