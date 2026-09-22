// Small reactive primitives: writable refs, derived values and event hooks.

type Listener<T> = (newValue: T, oldValue: T) => unknown;
type Subscribable = { subscribe: (listener: () => unknown) => () => void };

export type Ref<T> = {
	(): T;
	(newValue: T): void;
	subscribe: (listener: Listener<T>, options?: { immediate?: boolean }) => () => void;
	unsubscribe: (listener: Listener<T>) => void;
	clear: () => void;
};

export type Computed<T> = {
	(): T;
	subscribe: (listener: Listener<T>, options?: { immediate?: boolean }) => () => void;
	unsubscribe: (listener: Listener<T>) => void;
	dispose: () => void;
	clear: () => void;
};

type Args = ReadonlyArray<unknown>;
export type Hook<A extends Args = []> = {
	(...args: A): void;
	subscribe: (callback: (...args: A) => unknown) => () => void;
	unsubscribe: (callback: (...args: A) => unknown) => void;
	clear: () => void;
};

// Set while a computed getter runs without explicit deps; reading a ref reports itself here.
let track: ((source: Subscribable) => void) | undefined;

// A listener returning 'stop' prevents later listeners from running.
function notify<A extends Args>(listeners: Set<(...args: A) => unknown>, ...args: A) {
	// Copy first: a listener may subscribe or unsubscribe while we iterate.
	// oxlint-disable-next-line unicorn/no-useless-spread
	for (const listener of [...listeners]) if (listener(...args) === 'stop') break;
}

export function ref<T>(
	initial: T,
	options?: { equals?: (newValue: T, oldValue: T) => boolean },
): Ref<T> {
	const equals = options?.equals ?? ((a: T, b: T) => a === b);
	const listeners = new Set<Listener<T>>();
	let value = initial;

	// Called without an argument (or with undefined) it reads; otherwise it writes.
	const self = ((next?: T) => {
		if (next === undefined) {
			track?.(self);
			return value;
		}
		if (!equals(next, value)) {
			const previous = value;
			value = next;
			notify(listeners, next, previous);
		}
		return value;
	}) as Ref<T>;

	self.subscribe = (listener, subscribeOptions) => {
		listeners.add(listener);
		if (subscribeOptions?.immediate) listener(value, value);
		return () => self.unsubscribe(listener);
	};
	self.unsubscribe = (listener) => void listeners.delete(listener);
	self.clear = () => listeners.clear();
	return self;
}

export function hook<A extends Args = []>(): Hook<A> {
	const callbacks = new Set<(...args: A) => unknown>();
	const self = ((...args: A) => notify(callbacks, ...args)) as Hook<A>;
	self.subscribe = (callback) => {
		callbacks.add(callback);
		return () => self.unsubscribe(callback);
	};
	self.unsubscribe = (callback) => void callbacks.delete(callback);
	self.clear = () => callbacks.clear();
	return self;
}

export function computed<T>(
	getter: () => T,
	options?: {
		equals?: (newValue: T, oldValue: T) => boolean;
		deps?: Array<Subscribable>;
	},
): Computed<T> {
	const equals = options?.equals ?? ((a: T, b: T) => a === b);
	const listeners = new Set<Listener<T>>();
	const sources: Array<Subscribable> = [];
	let value: T;

	const self = (() => {
		track?.(self);
		return value;
	}) as Computed<T>;

	const recompute = () => {
		const previous = value;
		const next = getter();
		if (equals(next, previous)) return;
		value = next;
		notify(listeners, next, previous);
	};

	if (options?.deps) {
		sources.push(...options.deps);
		value = getter();
	} else {
		const outer = track;
		track = (source) => sources.push(source);
		try {
			value = getter();
		} finally {
			track = outer;
		}
	}
	const unsubscribers = sources.map((source) => source.subscribe(recompute));

	self.subscribe = (listener, subscribeOptions) => {
		listeners.add(listener);
		if (subscribeOptions?.immediate) listener(value, value);
		return () => self.unsubscribe(listener);
	};
	self.unsubscribe = (listener) => void listeners.delete(listener);
	self.dispose = () => {
		while (unsubscribers.length) unsubscribers.pop()?.();
	};
	self.clear = () => listeners.clear();
	return self;
}
