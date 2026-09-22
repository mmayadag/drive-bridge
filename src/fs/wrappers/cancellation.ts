import type { Ref } from '@/shared/reactive';
import type { MaybePromise, Binary, FileStat } from '@/types';
import { syncCancelledError } from '@/sync';
import type { Fs, ListReporter, WrappedFs } from '../interface';

function assertNotCancelled(isCancelled: Ref<boolean>) {
	if (isCancelled()) throw syncCancelledError;
}

class CancellationFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly isCancelled: Ref<boolean>,
	) {}

	private async guardCancellation<T>(
		when: 'pre' | 'post' | 'both',
		operation: () => Promise<T> | T,
	) {
		if (when !== 'post') assertNotCancelled(this.isCancelled);
		const result = await operation();
		if (when !== 'pre') assertNotCancelled(this.isCancelled);
		return result;
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.guardCancellation('pre', () => this.original.read(key, stat));
	}

	readStream(key: string, stat: FileStat) {
		return this.guardCancellation('pre', () => this.original.readStream(key, stat));
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.guardCancellation('post', () => this.original.write(key, value, stat));
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string> {
		return this.guardCancellation('post', () => this.original.writeStream(key, value, stat));
	}

	delete(key: string) {
		return this.guardCancellation('both', () => this.original.delete(key));
	}

	move(oldKey: string, newKey: string) {
		return this.guardCancellation('both', () => this.original.move(oldKey, newKey));
	}

	mkdir(key: string, recursive?: boolean) {
		return this.guardCancellation('both', () => this.original.mkdir(key, recursive));
	}

	stat(key: string) {
		return this.guardCancellation('both', () => this.original.stat(key));
	}

	exists(key: string) {
		return this.guardCancellation('both', () => this.original.exists(key));
	}

	list(key: string, reporter: ListReporter) {
		return this.guardCancellation('both', () => this.original.list(key, reporter));
	}
}

export function cancellationMiddleware<T extends (...args: never) => Promise<unknown>>(
	request: T,
	isCancelled: Ref<boolean>,
): NoInfer<T> {
	// T is only known to be some async function, so call it through an untyped view.
	const call = request as unknown as (...args: Array<unknown>) => Promise<unknown>;
	return ((...params: Array<unknown>) => {
		// Both `Request` and `VaultRequest` take options as their second argument.
		const options = params[1] as { ignoreCancellation?: boolean } | undefined;
		if (options?.ignoreCancellation) return call(...params);
		assertNotCancelled(isCancelled);
		const promise = new Promise<unknown>((resolve, reject) => {
			const unsub = isCancelled.subscribe((cancelled) => {
				if (cancelled) {
					unsub();
					reject(new DOMException('Aborted', 'AbortError'));
				}
			});
			call(...params)
				.then(resolve)
				.catch(reject)
				.finally(unsub);
		});
		return promise;
	}) as unknown as T;
}

export function cancellationWrapper(original: Fs, isCancelled: Ref<boolean>): WrappedFs {
	return new CancellationFs(original, isCancelled);
}
