// The bootstrap module: the core triggers, file system wrappers, request middlewares,
// deciders and conflict resolvers it registers, and the sync state its event handlers keep.

import kit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { Fs } from '@/fs';
import type {
	ConflictResolverEntry,
	DeciderEntry,
	FsWrapperEntry,
	TriggerEntry,
} from '@/modules/registrar';
import type { Stat } from '@/types';
import Bootstrap from '@/modules/bootstrap';
import { openMemoryDB } from '@/shared/key-value-store';
import { ref } from '@/shared/reactive';

type Apply = { apply: (input: never) => unknown; priority: number };
type Handler = (payload: never) => void;

function baseSettings() {
	return {
		confirmDeleteInAutoSync: true,
		confirmTasksInSync: false,
		customHeaders: [] as Array<{ type: 'plaintext' | 'secret'; value: string; key: string }>,
		maxMemoryConsumption: { enabled: true, value: 1000 },
		maxRequestConcurrency: { enabled: true, value: 5 },
		minRequestInterval: { enabled: true, value: 10 },
		realtimeSyncFastMode: false,
	};
}

function setup(settingsOverrides: Partial<ReturnType<typeof baseSettings>> = {}) {
	const secrets = new Map<string, string>([['header-secret', 'from-storage']]);
	const translations: Array<unknown> = [];
	const triggers = new Map<string, TriggerEntry>();
	const deciders = new Map<string, DeciderEntry>();
	const resolvers = new Map<string, ConflictResolverEntry>();
	const localWrappers: Array<FsWrapperEntry> = [];
	const remoteWrappers: Array<FsWrapperEntry> = [];
	const localOptimizers: Array<Apply> = [];
	const remoteOptimizers: Array<Apply> = [];
	const remoteMiddlewares: Array<Apply> = [];
	const localMiddlewares: Array<Apply> = [];
	const handlers = new Map<string, Handler>();
	const unsubscribed: Array<string> = [];
	const memoryDB = openMemoryDB('bootstrap-test');
	const ctx = {
		app: { secretStorage: { getSecret: (key: string) => secrets.get(key) } },
		dispatch: () => {},
		memoryDB,
		on: (name: string, handler: Handler) => {
			handlers.set(name, handler);
			return () => void unsubscribed.push(name);
		},
		optimizeLocal: ({ atoms }: { atoms: Array<unknown> }) => atoms,
		optimizeRemote: ({ atoms }: { atoms: Array<unknown> }) => atoms,
		registerConflictResolver: (id: string, entry: ConflictResolverEntry) =>
			void resolvers.set(id, entry),
		registerDecider: (id: string, entry: DeciderEntry) => void deciders.set(id, entry),
		registerLocalFsWrapper: (entry: FsWrapperEntry) => void localWrappers.push(entry),
		registerLocalOptimizer: (entry: Apply) => void localOptimizers.push(entry),
		registerLocalRequestMiddleware: (entry: Apply) => void localMiddlewares.push(entry),
		registerRemoteFsWrapper: (entry: FsWrapperEntry) => void remoteWrappers.push(entry),
		registerRemoteOptimizer: (entry: Apply) => void remoteOptimizers.push(entry),
		registerRemoteRequestMiddleware: (entry: Apply) => void remoteMiddlewares.push(entry),
		registerTranslations: (resource: unknown) => void translations.push(resource),
		registerTrigger: (key: string, entry: TriggerEntry) => {
			triggers.set(key, entry);
			return () => true;
		},
		translate: (key: string) => `t:${key}`,
	};
	const bootstrap = new Bootstrap(ctx as never);
	const settings = { ...baseSettings(), ...settingsOverrides };
	Object.assign(bootstrap, { settings });
	bootstrap.start();
	const emit = (name: string, payload?: unknown) => handlers.get(name)?.(payload as never);
	return {
		bootstrap,
		deciders,
		emit,
		localMiddlewares,
		localOptimizers,
		localWrappers,
		memoryDB,
		remoteMiddlewares,
		remoteOptimizers,
		remoteWrappers,
		resolvers,
		secrets,
		settings,
		translations,
		triggers,
		unsubscribed,
	};
}

const byPriority = (entries: Array<{ priority: number }>, priority: number) => {
	const entry = entries.find((item) => item.priority === priority);
	if (!entry) throw new Error(`No entry at priority ${priority}`);
	return entry as Apply;
};

test('the constructor registers the English translations', () => {
	expect(setup().translations).toHaveLength(1);
});

test('triggers carry their priority and read the confirmation settings when asked', () => {
	const { triggers, settings } = setup();
	expect(
		Object.fromEntries([...triggers].map(([key, entry]) => [key, entry.priority])),
	).toStrictEqual({
		interval: 2000,
		leave: 1500,
		manual: 4000,
		nonInteractiveManual: 3990,
		realtime: 1000,
		startup: 3000,
	});
	for (const key of ['leave', 'interval', 'startup'])
		expect(triggers.get(key)?.options?.()).toStrictEqual({ needConfirmDeletion: true });
	expect(triggers.get('realtime')?.options?.()).toStrictEqual({
		needConfirmDeletion: true,
		remoteLister: undefined,
	});
	expect(triggers.get('manual')?.options?.()).toStrictEqual({ needConfirmTasks: false });
	expect(triggers.get('nonInteractiveManual')?.options).toBeUndefined();

	settings.confirmDeleteInAutoSync = false;
	settings.confirmTasksInSync = true;
	expect(triggers.get('interval')?.options?.()).toStrictEqual({ needConfirmDeletion: false });
	expect(triggers.get('manual')?.options?.()).toStrictEqual({ needConfirmTasks: true });
});

test('fast realtime sync lists the remote from the last known context', async () => {
	const { triggers, memoryDB } = setup({ realtimeSyncFastMode: true });
	// Without a known remote there is nothing to list from.
	expect(triggers.get('realtime')?.options?.().remoteLister).toBeUndefined();

	const store = memoryDB.getStore('remoteContext20000');
	store.set('a.md', kit.file('a.md'));
	store.set('b.md', kit.file('b.md'));
	const lister = triggers.get('realtime')?.options?.().remoteLister;
	const reported: Array<unknown> = [];
	const listed = (await lister?.({
		reporter: (progress: { current: string }) => {
			reported.push(progress);
			return progress.current === 'b.md' ? 'exclude' : undefined;
		},
	} as never)) as Array<Stat>;
	expect(listed.map((stat) => stat.key)).toEqual(['a.md']);
	expect(reported).toEqual([
		{ completed: 1, current: 'a.md', total: 2 },
		{ completed: 2, current: 'b.md', total: 2 },
	]);
});

test('both sides get the hierarchical optimizer', () => {
	const { localOptimizers, remoteOptimizers } = setup();
	expect(localOptimizers.map((entry) => entry.priority)).toEqual([10_000]);
	expect(remoteOptimizers.map((entry) => entry.priority)).toEqual([10_000]);
});

test('each side wraps its file system in order, cancellation only during a sync', () => {
	const { localWrappers, remoteWrappers, emit } = setup();
	for (const wrappers of [localWrappers, remoteWrappers]) {
		expect(wrappers.map((entry) => entry.priority)).toEqual([1000, 2000, 3000, 20_000, 21_000]);
		const { fs } = kit.fs();
		for (const priority of [1000, 2000, 20_000, 21_000]) {
			const wrapped = byPriority(wrappers, priority).apply(fs as never) as Fs & {
				original: Fs;
			};
			expect(wrapped.original).toBe(fs);
		}
		// No sync is running, so there is nothing to cancel.
		expect(byPriority(wrappers, 3000).apply(fs as never)).toBeUndefined();
	}

	emit('syncStarted', { isCancelled: ref(false) });
	for (const wrappers of [localWrappers, remoteWrappers]) {
		const { fs } = kit.fs();
		const wrapped = byPriority(wrappers, 3000).apply(fs as never) as { original: Fs };
		expect(wrapped.original).toBe(fs);
	}
});

test('the memory wrapper uses the memory limit only while it is enabled', async () => {
	const { localWrappers, settings } = setup();
	const { fs } = kit.fs();
	settings.maxMemoryConsumption.enabled = false;
	const wrapped = byPriority(localWrappers, 1000).apply(fs as never) as Fs;
	expect(await wrapped.read('a.md', kit.file('a.md'))).toBeInstanceOf(Uint8Array);
});

test('the companions read ahead on the other side once the sync has both file systems', async () => {
	const { localWrappers, remoteWrappers, emit } = setup();
	const local = kit.fs();
	const remote = kit.fs();
	const localCompanion = byPriority(localWrappers, 21_000).apply(local.fs as never) as Fs;
	const remoteCompanion = byPriority(remoteWrappers, 21_000).apply(remote.fs as never) as Fs;

	// Before the sync is initialized the other side is unknown; the read still goes through.
	await localCompanion.read('a.md', kit.file('a.md'));
	await remoteCompanion.read('b.md', kit.file('b.md'));
	expect(local.calls.read.map(([key]) => key)).toEqual(['a.md']);
	expect(remote.calls.read.map(([key]) => key)).toEqual(['b.md']);

	emit('syncInitialized', { localFs: local.fs, remoteFs: remote.fs });
	const localAgain = byPriority(localWrappers, 21_000).apply(local.fs as never) as Fs;
	const remoteAgain = byPriority(remoteWrappers, 21_000).apply(remote.fs as never) as Fs;
	await localAgain.read('c.md', kit.file('c.md'));
	await remoteAgain.read('d.md', kit.file('d.md'));
	expect(remote.calls.read.map(([key]) => key)).toContain('c.md');
	expect(local.calls.read.map(([key]) => key)).toContain('d.md');
});

test('remote requests get retries, rate limits, custom headers and cancellation', async () => {
	const { remoteMiddlewares, settings, secrets, emit } = setup();
	expect(remoteMiddlewares.map((entry) => entry.priority)).toEqual([1000, 2000, 3000, 4000]);
	const { request, calls } = kit.request(() => ({}));
	for (const priority of [1000, 2000])
		expect(typeof byPriority(remoteMiddlewares, priority).apply(request as never)).toBe(
			'function',
		);
	settings.maxRequestConcurrency.enabled = false;
	settings.minRequestInterval.enabled = false;
	expect(typeof byPriority(remoteMiddlewares, 2000).apply(request as never)).toBe('function');

	settings.customHeaders = [
		{ key: 'X-Plain', type: 'plaintext', value: 'plain' },
		{ key: 'X-Secret', type: 'secret', value: 'header-secret' },
	];
	const withHeaders = byPriority(remoteMiddlewares, 3000).apply(request as never) as (
		url: string,
		params?: object,
	) => Promise<unknown>;
	await withHeaders('https://www.googleapis.com/x', { headers: { A: 'b' } });
	expect(calls[0].headers).toStrictEqual({
		A: 'b',
		'X-Plain': 'plain',
		'X-Secret': 'from-storage',
	});

	secrets.clear();
	expect(() => byPriority(remoteMiddlewares, 3000).apply(request as never)).toThrow(
		'Custom secret header not found: "X-Secret".',
	);

	expect(byPriority(remoteMiddlewares, 4000).apply(request as never)).toBeUndefined();
	emit('syncStarted', { isCancelled: ref(false) });
	expect(typeof byPriority(remoteMiddlewares, 4000).apply(request as never)).toBe('function');
});

test('vault requests are rate limited and cancellable during a sync', () => {
	const { localMiddlewares, emit } = setup();
	expect(localMiddlewares.map((entry) => entry.priority)).toEqual([1000, 2000]);
	const { request } = kit.request(() => ({}));
	expect(typeof byPriority(localMiddlewares, 1000).apply(request as never)).toBe('function');
	expect(byPriority(localMiddlewares, 2000).apply(request as never)).toBeUndefined();
	emit('syncStarted', { isCancelled: ref(false) });
	expect(typeof byPriority(localMiddlewares, 2000).apply(request as never)).toBe('function');
	emit('syncTerminated', { result: 'completed' });
	expect(byPriority(localMiddlewares, 2000).apply(request as never)).toBeUndefined();
});

test('deciders describe themselves through translations', () => {
	const { deciders } = setup();
	const describe = [...deciders].map(([id, entry]) => ({
		description: entry.description?.(),
		flow: entry.flow,
		id,
		name: entry.prettyName(),
		order: entry.order,
		repair: entry.repair,
		warning: entry.warning?.(),
	}));
	expect(describe).toStrictEqual([
		{
			description: 't:bidirectionalDescription',
			flow: 'both',
			id: 'bidirectional',
			name: 't:bidirectional',
			order: 10,
			repair: undefined,
			warning: undefined,
		},
		{
			description: 't:mirrorLocalDescription',
			flow: 'toRemote',
			id: 'mirrorLocal',
			name: 't:mirrorLocal',
			order: 20,
			repair: true,
			warning: 't:mirrorLocalWarning',
		},
		{
			description: 't:mirrorRemoteDescription',
			flow: 'toLocal',
			id: 'mirrorRemote',
			name: 't:mirrorRemote',
			order: 30,
			repair: true,
			warning: 't:mirrorRemoteWarning',
		},
	]);
});

test('conflict resolvers describe themselves, and skip does nothing', () => {
	const { resolvers } = setup();
	const describe = [...resolvers].map(([id, entry]) => [
		id,
		entry.prettyName(),
		entry.description?.(),
		entry.example?.(),
		entry.warning?.(),
		entry.lossy ?? false,
		entry.order,
	]);
	expect(describe).toStrictEqual([
		[
			'renameAndKeepBoth',
			't:renameAndKeepBoth',
			't:renameAndKeepBothDescription',
			't:renameAndKeepBothExample',
			undefined,
			false,
			10,
		],
		[
			'latestSurvive',
			't:latestSurvive',
			't:latestSurviveDescription',
			undefined,
			't:latestSurviveWarning',
			true,
			40,
		],
		[
			'keepLocal',
			't:keepLocal',
			't:keepLocalDescription',
			undefined,
			't:keepLocalWarning',
			true,
			50,
		],
		[
			'keepRemote',
			't:keepRemote',
			't:keepRemoteDescription',
			undefined,
			't:keepRemoteWarning',
			true,
			60,
		],
		['skip', 't:skip', 't:skipDescription', undefined, undefined, false, 30],
	]);
	expect(resolvers.get('skip')?.resolver({} as never)).toBeUndefined();
});

test('a terminated sync forgets its file systems, so the companions lose the other side', async () => {
	const { localWrappers, emit } = setup();
	const local = kit.fs();
	const remote = kit.fs();
	emit('syncInitialized', { localFs: local.fs, remoteFs: remote.fs });
	emit('syncTerminated', { result: 'completed' });
	const companion = byPriority(localWrappers, 21_000).apply(local.fs as never) as Fs;
	await companion.read('a.md', kit.file('a.md'));
	expect(remote.calls.read).toHaveLength(0);
});

test('dispose unsubscribes from the sync events', () => {
	const { bootstrap, unsubscribed } = setup();
	bootstrap.dispose();
	expect(unsubscribed).toEqual(['syncStarted', 'syncInitialized', 'syncTerminated']);
	bootstrap.dispose();
	expect(unsubscribed).toHaveLength(3);
});
