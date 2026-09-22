// A lock that lets many readers share a database connection but gives a writer exclusive
// Use. Creating or deleting an object store needs a version upgrade, which must run alone.

export default class ReadWriteGate {
	private readers = 0;
	private writer = false;
	private waitingWriters = 0;
	private readonly readWaiters: Array<() => void> = [];
	private readonly writeWaiters: Array<() => void> = [];

	private wake() {
		if (this.writer || this.readers > 0) return;
		const nextWriter = this.writeWaiters.shift();
		if (nextWriter) {
			this.writer = true;
			nextWriter();
			return;
		}
		while (this.readWaiters.length > 0 && this.writeWaiters.length === 0) {
			this.readers++;
			this.readWaiters.shift()?.();
		}
	}

	private async acquireShared() {
		if (!this.writer && this.waitingWriters === 0) {
			this.readers++;
			return;
		}
		await new Promise<void>((resolve) => {
			this.readWaiters.push(resolve);
		});
	}

	private async acquireExclusive() {
		this.waitingWriters++;
		if (!this.writer && this.readers === 0) {
			this.waitingWriters--;
			this.writer = true;
			return;
		}
		await new Promise<void>((resolve) => {
			this.writeWaiters.push(resolve);
		});
		this.waitingWriters--;
	}

	private releaseShared() {
		this.readers--;
		if (this.readers === 0) this.wake();
	}

	async shared<T>(task: () => Promise<T>) {
		await this.acquireShared();
		try {
			return await task();
		} finally {
			this.releaseShared();
		}
	}

	async exclusive<T>(task: () => Promise<T>) {
		await this.acquireExclusive();
		try {
			return await task();
		} finally {
			this.writer = false;
			this.wake();
		}
	}

	// Called while holding the exclusive lock: turns it into a shared one.
	async downgrade<T>(task: () => Promise<T>) {
		this.writer = false;
		this.readers++;
		this.wake();
		try {
			return await task();
		} finally {
			this.releaseShared();
		}
	}
}
