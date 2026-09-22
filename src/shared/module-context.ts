// Dependency container that wires the plugin's modules into one shared context.

type Empty = Record<never, never>;

// oxlint-disable-next-line typescript/no-explicit-any
type General = any;
type GeneralConstructor = new (...args: Array<General>) => General;
type ModuleConstructor<C extends object> = new (context: C) => General;
type GeneralModuleInput = ReadonlyArray<GeneralConstructor> | ReadonlyArray<object>;

// oxlint-disable-next-line typescript/no-unsafe-function-type
type NonPlain = Function | Date | RegExp | Array<General> | Map<General, General> | Set<General>;
type IsPlainObject<T> = T extends object ? (T extends NonPlain ? false : true) : false;
type ShallowMerge<A, B> =
	IsPlainObject<A> extends true ? (IsPlainObject<B> extends true ? Omit<A, keyof B> & B : B) : B;
type Keys<T> = T extends General ? keyof T : never;
type InstanceEach<T extends GeneralModuleInput> =
	T extends ReadonlyArray<GeneralConstructor> ? { [K in keyof T]: InstanceType<T[K]> } : T;
type PickEach<T extends ReadonlyArray<object>, K extends PropertyKey> = {
	[I in keyof T]: Pick<T[I], Extract<K, keyof T[I]>>;
};

const ROOT_KEY = 'root';
type RootKey = typeof ROOT_KEY;
type RootValue<T extends object> = RootKey extends keyof T ? Extract<T[RootKey], object> : Empty;
type MergeRootEach<T extends ReadonlyArray<object>> = {
	[I in keyof T]: ShallowMerge<Omit<T[I], RootKey>, RootValue<T[I]>>;
};
type ExtractKeyEach<T extends ReadonlyArray<object>, K extends Keys<T>> = {
	[I in keyof T]: K extends keyof T[I] ? T[I][K] : never;
};
type MergePair<A, B> = [A] extends [never] ? B : [B] extends [never] ? A : ShallowMerge<A, B>;
type MergeValues<T extends ReadonlyArray<unknown>> = T extends readonly [infer First, ...infer Rest]
	? [First] extends [never]
		? MergeValues<Rest>
		: Rest['length'] extends 0
			? First
			: MergePair<First, MergeValues<Rest>>
	: never;
type MergeObjects<
	T extends ReadonlyArray<object>,
	O extends ReadonlyArray<object> = MergeRootEach<T>,
> = { [P in Keys<O[number]>]: MergeValues<ExtractKeyEach<O, P>> };
type MergeResult<
	M extends GeneralModuleInput,
	K extends Keys<InstanceEach<M>[number]>,
	Pr extends object,
	Po extends object,
> = MergeObjects<[Pr, ...PickEach<InstanceEach<M>, K>, Po]>;

export type MergeSingleKey<
	M extends GeneralModuleInput,
	K extends Keys<InstanceEach<M>[number]>,
> = MergeValues<ExtractKeyEach<InstanceEach<M>, K>>;

export type Context<
	M extends GeneralModuleInput,
	K extends Keys<InstanceEach<M>[number]>,
	Pr extends object = Empty,
	Po extends object = Empty,
> = MergeResult<M, K, Pr, Po> & {
	__modules__: WeakMap<M[number], InstanceEach<M>[number]>;
	__getModule__: <C extends new (ctx: General) => InstanceEach<M>[number]>(
		ctor: C,
	) => InstanceType<C>;
	__addModule__: <N extends ModuleConstructor<Context<[...M, N], K, Pr, Po>>>(
		newModule: N,
	) => Context<[...M, N], K, Pr, Po>;
	__assign__: (obj: Partial<MergeResult<M, K, Pr, Po>>) => Context<M, K, Pr, Po>;
};

type PlainObject = Record<PropertyKey, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

// Plain objects merge shallowly into an existing plain object; anything else replaces it.
function mergeKey(target: PlainObject, key: PropertyKey, value: unknown) {
	if (value === undefined) return;
	const existing = target[key];
	if (isPlainObject(existing) && isPlainObject(value)) Object.assign(existing, value);
	else target[key] = value;
}

function mergeAll(target: PlainObject, source: unknown) {
	if (!isPlainObject(source)) return;
	for (const key of Object.keys(source)) mergeKey(target, key, source[key]);
}

/**
 * Instantiates modules in order and merges their `mergeKeys` into one shared context.
 *
 * Merge order: `preMerge` -> module keys -> `postMerge` -> `__assign__`. A module's
 * `root` key is flattened into the context itself. After every merge, `injectKeys`
 * (default: `mergeKeys`) are written back to each module instance, so modules see the
 * merged result. Injecting `root` hands the module the whole context.
 */
export function createContext<
	M extends ReadonlyArray<ModuleConstructor<Context<M, K, Pr, Po>>>,
	K extends Keys<InstanceEach<M>[number]>,
	Po extends object = Empty,
	Pr extends object = Empty,
>(
	classes: M,
	options: {
		preMerge?: Pr;
		postMerge?: Po;
		mergeKeys: ReadonlyArray<K>;
		injectKeys?: ReadonlyArray<NoInfer<K>>;
	},
): Context<M, K, Pr, Po> {
	const context: PlainObject = {};
	const mergeKeys = options.mergeKeys as ReadonlyArray<string>;
	const injectKeys = (options.injectKeys ?? options.mergeKeys) as ReadonlyArray<string>;
	const instances: Array<PlainObject> = [];
	const modules = new WeakMap<GeneralConstructor, PlainObject>();

	const mergeInstance = (instance: PlainObject) => {
		for (const key of mergeKeys) {
			const value = instance[key];
			if (key === ROOT_KEY) {
				if (isPlainObject(value)) mergeAll(context, value);
				continue;
			}
			mergeKey(context, key, value);
		}
	};

	const inject = () => {
		for (const instance of instances)
			for (const key of injectKeys) {
				if (context[key] === undefined) context[key] = {};
				instance[key] = key === ROOT_KEY ? context : context[key];
			}
	};

	const finalize = () => {
		mergeAll(context, options.postMerge);
		inject();
	};

	const addInstance = (ctor: GeneralConstructor) => {
		const instance = new ctor(context) as PlainObject;
		modules.set(ctor, instance);
		instances.push(instance);
		mergeInstance(instance);
	};

	Object.defineProperties(context, {
		__addModule__: {
			enumerable: false,
			value: (ctor: GeneralConstructor) => {
				addInstance(ctor);
				finalize();
				return context;
			},
		},
		__assign__: {
			enumerable: false,
			value: (values: object) => {
				mergeAll(context, values);
				return context;
			},
		},
		__getModule__: {
			enumerable: false,
			value: (ctor: GeneralConstructor) => {
				const instance = modules.get(ctor);
				if (!instance) throw new Error('Module not found in context');
				return instance;
			},
		},
		__modules__: { enumerable: false, value: modules },
	});

	mergeAll(context, options.preMerge);
	for (const ctor of classes) addInstance(ctor);
	finalize();
	return context as Context<M, K, Pr, Po>;
}
