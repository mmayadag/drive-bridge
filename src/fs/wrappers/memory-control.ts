import type { Binary, FileStat, MaybePromise } from '@/types';
import type { Fs, ListReporter, WrappedFs } from '../interface';

type HangingOperation = {
	/** Memory reservation, usually capped at `STREAM_RESERVATION_SIZE`. */
	size: number;
	/** Transfer size, larger operations resume first. */
	priority: number;
	resume: () => void;
};

export type MemoryControlSharedState = {
	memoryConsumption: number;
	hangingOperations: Array<HangingOperation>;
	maxMemory: number;
};

export const STREAM_RESERVATION_SIZE = 16 * 1024 * 1024;

function canReserve(state: MemoryControlSharedState, size: number) {
	const { memoryConsumption, maxMemory } = state;
	return memoryConsumption + size <= maxMemory || memoryConsumption === 0;
}

function insertHangingOperation(state: MemoryControlSharedState, operation: HangingOperation) {
	const { hangingOperations } = state;
	let index = 0;
	while (
		index < hangingOperations.length &&
		hangingOperations[index].priority >= operation.priority
	)
		index += 1;
	hangingOperations.splice(index, 0, operation);
}

function resumeHangingOperations(state: MemoryControlSharedState) {
	const { hangingOperations } = state;
	// Largest transfers first, but keep backfilling smaller ones into leftover budget instead of stopping at the first operation that does not fit.
	for (let index = 0; index < hangingOperations.length;) {
		const operation = hangingOperations[index];
		if (!canReserve(state, operation.size)) {
			index += 1;
			continue;
		}
		hangingOperations.splice(index, 1);
		state.memoryConsumption += operation.size;
		operation.resume();
	}
}

/** What a transfer holds in memory at once: streams read and write in pieces. */
function reservationOf(stat: FileStat) {
	return Math.min(stat.size, STREAM_RESERVATION_SIZE);
}

function reserveMemory(
	state: MemoryControlSharedState,
	stat: FileStat,
	size = reservationOf(stat),
) {
	if (canReserve(state, size)) {
		state.memoryConsumption += size;
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		insertHangingOperation(state, {
			priority: stat.size,
			resume: () => resolve(),
			size,
		});
	});
}

function releaseMemory(state: MemoryControlSharedState, size: number) {
	state.memoryConsumption = Math.max(0, state.memoryConsumption - size);
	resumeHangingOperations(state);
}

/**
 * Passes `stream` on and calls `release` once, when it is read to the end, fails or is
 * cancelled.
 */
function releaseAfter(stream: ReadableStream<Binary>, release: () => void) {
	const reader = stream.getReader();
	let released = false;
	const releaseOnce = () => {
		if (released) return;
		released = true;
		release();
	};
	return new ReadableStream<Binary>(
		{
			cancel(reason) {
				releaseOnce();
				return reader.cancel(reason);
			},
			async pull(controller) {
				try {
					const { done, value } = await reader.read();
					if (done) {
						releaseOnce();
						controller.close();
					} else controller.enqueue(value);
				} catch (error) {
					releaseOnce();
					controller.error(error);
				}
			},
		},
		{ highWaterMark: 0 },
	);
}

export type MemoryControlOptions = {
	/**
	 * The file system reads a whole file before streaming it, so a stream holds the whole
	 * file, not a few pieces, until it is read.
	 */
	wholeFileStreams?: boolean;
};

class MemoryControlRemoteFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly state: MemoryControlSharedState,
		private readonly options: MemoryControlOptions,
	) {}

	private async readThroughMemory<T>(
		read: () => MaybePromise<T>,
		stat: FileStat,
		size = reservationOf(stat),
	) {
		await reserveMemory(this.state, stat, size);
		try {
			return await read();
		} catch (error) {
			releaseMemory(this.state, size);
			throw error;
		}
	}

	private async writeThroughMemory<T>(write: () => MaybePromise<T>, stat: FileStat) {
		try {
			return await write();
		} finally {
			releaseMemory(this.state, reservationOf(stat));
		}
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.readThroughMemory(() => this.original.read(key, stat), stat);
	}

	async readStream(key: string, stat: FileStat) {
		const read = () => this.original.readStream(key, stat);
		if (!this.options.wholeFileStreams) return this.readThroughMemory(read, stat);
		// Hold the whole file until it is read; the write side then releases the usual part.
		const extra = stat.size - reservationOf(stat);
		const stream = await this.readThroughMemory(read, stat, stat.size);
		if (extra <= 0) return stream;
		return releaseAfter(stream, () => releaseMemory(this.state, extra));
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.writeThroughMemory(() => this.original.write(key, value, stat), stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.writeThroughMemory(() => this.original.writeStream(key, value, stat), stat);
	}

	delete(key: string) {
		return this.original.delete(key);
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}

	mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(key, recursive);
	}

	stat(key: string) {
		return this.original.stat(key);
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, reporter: ListReporter) {
		return this.original.list(key, reporter);
	}
}

export default function memoryControlWrapper(
	original: Fs,
	state: MemoryControlSharedState,
	options: MemoryControlOptions = {},
): WrappedFs {
	return new MemoryControlRemoteFs(original, state, options);
}
