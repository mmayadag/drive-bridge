// The registrar: where modules plug in remote backends, deciders, conflict resolvers,
// triggers, and wrapping middleware, and where core assembles them into working pieces
// (a local/remote Fs, a request function, a sync namespace).

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { Fs } from '@/fs';

// A self-contained requestUrl: other test files also mock 'obsidian' from their own module
// top level, and Bun's module graph can link this file's static `@/modules/registrar`
// import against whichever one last won that race. Only a dynamic import taken after this
// file's own mock.module call is guaranteed to see it.
const requests: Array<{ url: string }> = [];
void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: { url: string }) => {
		requests.push(params);
		return Promise.resolve({
			arrayBuffer: new Uint8Array([7, 8]).buffer,
			headers: {},
			json: { ok: true },
			status: 200,
			text: '',
		});
	},
}));

const { default: Registrar, setRegister } = await import('@/modules/registrar');

function fakeApp() {
	return {
		vault: { adapter: {}, config: {}, getName: () => 'Test Vault' },
		workspace: { layoutReady: true },
	} as never;
}

function fakeFs(uid: string): Fs {
	return {
		delete: () => {},
		exists: () => false,
		getUid: () => uid,
		list: () => [],
		mkdir: () => {},
		move: () => {},
		read: () => new Uint8Array(),
		readStream: () => new ReadableStream(),
		stat: () => {
			throw new Error('not implemented');
		},
		write: () => 'uid',
		writeStream: () => 'uid',
	};
}

function registrar(overrides: { getRecordStore?: (namespace?: string) => unknown } = {}) {
	const instance = new Registrar({
		app: fakeApp(),
		getRecordStore: (overrides.getRecordStore ?? (() => ({}))) as never,
	});
	Object.assign(instance, {
		settings: { conflictResolver: '', decider: '', remoteFs: '' },
	});
	return instance;
}

test('setRegister adds and un-adds via the returned cleanup', () => {
	const set = new Set<string>();
	const register = setRegister(set);
	const unregister = register('a');
	expect(set.has('a')).toBe(true);
	unregister();
	expect(set.has('a')).toBe(false);
});

test('registering a decider (mapRegister-backed) sets and un-sets via the cleanup', () => {
	const { root } = registrar();
	const decider = (() => []) as never;
	const unregister = root.registerDecider('bidirectional', {
		decider,
		prettyName: () => 'Bidirectional',
	});
	expect(root.deciderRegistry.get('bidirectional')?.decider).toBe(decider);
	unregister();
	expect(root.deciderRegistry.has('bidirectional')).toBe(false);
});

test('createRemoteFs refuses an empty or unknown backend', () => {
	const { root } = registrar();
	expect(() => root.createRemoteFs()).toThrow('Please set a backend!');
	expect(() => root.createRemoteFs('ghost')).toThrow('"ghost" is not installed!');
});

test('createRemoteFs instantiates the registered backend, wrapped in order', () => {
	const { root } = registrar();
	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('gdrive-fs'),
		prettyName: () => 'Google Drive',
	});
	root.registerRemoteFsWrapper({
		apply: (fs) => ({ ...fs, getUid: () => `wrapped~${fs.getUid()}` }),
		priority: 10,
	});

	const fs = root.createRemoteFs('gdrive');
	expect(fs.getUid()).toBe('wrapped~gdrive-fs');
});

test('a wrapper that declines (returns undefined) leaves the value untouched', () => {
	const { root } = registrar();
	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('gdrive-fs'),
		prettyName: () => 'Google Drive',
	});
	root.registerRemoteFsWrapper({ apply: () => {}, priority: 10 });

	expect(root.createRemoteFs('gdrive').getUid()).toBe('gdrive-fs');
});

test('wrappers apply in ascending priority order, lower first', () => {
	const { root } = registrar();
	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('base'),
		prettyName: () => 'Google Drive',
	});
	const order: Array<string> = [];
	root.registerRemoteFsWrapper({
		apply: (fs) => {
			order.push('second');
			return fs;
		},
		priority: 20,
	});
	root.registerRemoteFsWrapper({
		apply: (fs) => {
			order.push('first');
			return fs;
		},
		priority: 10,
	});

	root.createRemoteFs('gdrive');
	expect(order).toStrictEqual(['first', 'second']);
});

test('at the same priority, only the first wrapper to accept wins', () => {
	const { root } = registrar();
	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('base'),
		prettyName: () => 'Google Drive',
	});
	let secondCalled = false;
	root.registerRemoteFsWrapper({ apply: (fs) => fs, priority: 10 });
	root.registerRemoteFsWrapper({
		apply: (fs) => {
			secondCalled = true;
			return fs;
		},
		priority: 10,
	});

	root.createRemoteFs('gdrive');
	expect(secondCalled).toBe(false);
});

test('getCheckConnection refuses an empty or unknown backend, otherwise delegates', async () => {
	const { root } = registrar();
	expect(() => root.getCheckConnection()).toThrow('Please install a backend!');
	expect(() => root.getCheckConnection('ghost')).toThrow('"ghost" is not installed!');

	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('gdrive-fs'),
		prettyName: () => 'Google Drive',
	});
	expect(await root.getCheckConnection('gdrive')()).toStrictEqual({ success: true });
});

test('getDecider refuses an unknown strategy, otherwise returns it', () => {
	const instance = registrar();
	instance.settings.decider = 'bidirectional';
	const { root } = instance;
	expect(() => root.getDecider()).toThrow('"bidirectional" not installed!');

	const decider = (() => []) as never;
	root.registerDecider('bidirectional', { decider, prettyName: () => 'Bidirectional' });
	expect(root.getDecider()).toBe(decider);
});

test('getConflictResolver refuses an unknown strategy, otherwise returns it', () => {
	const instance = registrar();
	instance.settings.conflictResolver = 'keepLocal';
	const { root } = instance;
	expect(() => root.getConflictResolver()).toThrow('"keepLocal" not installed!');

	const resolver = (() => {}) as never;
	root.registerConflictResolver('keepLocal', { prettyName: () => 'Keep local', resolver });
	expect(root.getConflictResolver()).toBe(resolver);
});

test('reduceTriggers picks the highest-priority registered trigger among the given names', () => {
	const { root } = registrar();
	root.registerTrigger('manual', { priority: 10 });
	root.registerTrigger('auto', { options: () => ({ detectMoves: true }), priority: 5 });

	expect(root.reduceTriggers(['auto', 'manual'])).toStrictEqual({
		options: undefined,
		trigger: 'manual',
	});
	expect(root.reduceTriggers(['auto'])).toStrictEqual({
		options: { detectMoves: true },
		trigger: 'auto',
	});
	expect(root.reduceTriggers(['unregistered'])).toStrictEqual({
		options: undefined,
		trigger: 'unknown',
	});
});

test('getNamespace hashes both sides deterministically and by identity', () => {
	const { root } = registrar();
	const a = root.getNamespace(fakeFs('local'), fakeFs('remote'));
	const b = root.getNamespace(fakeFs('local'), fakeFs('remote'));
	const c = root.getNamespace(fakeFs('other'), fakeFs('remote'));
	expect(a).toBe(b);
	expect(a).not.toBe(c);
});

test('initializeSync assembles local and remote fs plus a namespaced record store', () => {
	const requestedNamespaces: Array<string | undefined> = [];
	const instance = registrar({
		getRecordStore: (namespace) => {
			requestedNamespaces.push(namespace);
			return { namespace };
		},
	});
	instance.settings.remoteFs = 'gdrive';
	const { root } = instance;
	root.registerRemoteFs('gdrive', {
		checkConnection: () => ({ success: true }),
		instantiate: () => fakeFs('gdrive-fs'),
		prettyName: () => 'Google Drive',
	});

	const infras = root.initializeSync();
	expect(infras.localFs.getUid()).toBe('obsidian-vault~Test Vault');
	expect(infras.remoteFs.getUid()).toBe('gdrive-fs');
	expect(requestedNamespaces).toHaveLength(1);
	expect(requestedNamespaces[0]).toBe(root.getNamespace(infras.localFs, infras.remoteFs));
});

test('optimizeLocal and optimizeRemote run registered optimizers by priority until one accepts', () => {
	const { root } = registrar();
	const calls: Array<string> = [];
	root.registerLocalOptimizer({
		apply: ((input: unknown) => {
			calls.push('low-priority');
			return input;
		}) as never,
		priority: 20,
	});
	root.registerLocalOptimizer({
		apply: () => {
			calls.push('high-priority-declines');
		},
		priority: 10,
	});

	const input = [{ key: 'a.md' }] as never;
	expect(root.optimizeLocal(input)).toBe(input);
	expect(calls).toStrictEqual(['high-priority-declines', 'low-priority']);
});

test('optimizeRemote throws when nothing accepts', () => {
	const { root } = registrar();
	expect(() => root.optimizeRemote([] as never)).toThrow('No qualified apply found!');
});

test('getRequest and getVaultRequest wrap the base implementation through registered middleware', () => {
	const { root } = registrar();
	const seen: Array<string> = [];
	root.registerRemoteRequestMiddleware({
		apply: (base) => {
			seen.push('remote');
			return base;
		},
		priority: 1,
	});
	root.registerLocalRequestMiddleware({
		apply: (base) => {
			seen.push('local');
			return base;
		},
		priority: 1,
	});

	expect(typeof root.getRequest()).toBe('function');
	expect(typeof root.getVaultRequest()).toBe('function');
	expect(seen).toStrictEqual(['remote', 'local']);
});

test('the base request wraps requestUrl and converts a binary body', async () => {
	requests.length = 0;
	const { root } = registrar();
	const response = await root.getRequest()('https://example.com/api', {
		body: new Uint8Array([1, 2, 3]),
		method: 'POST',
	});

	expect(response.status).toBe(200);
	expect(response.text()).toBe('');
	expect(response.bytes()).toStrictEqual(new Uint8Array([7, 8]));
	expect(response.json()).toStrictEqual({ ok: true });
	expect(response.headers).toStrictEqual({});
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url).toBe('https://example.com/api');
	// The Uint8Array body must have been converted to an ArrayBuffer for requestUrl.
	expect((requests[0] as unknown as { body: unknown }).body).toBeInstanceOf(ArrayBuffer);
});
