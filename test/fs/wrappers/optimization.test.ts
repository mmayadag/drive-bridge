import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { OptimizerInput, OptimizerOutput } from '@/fs';
import { optimizationCompanionWrapper, optimizationWrapper } from '@/fs';

type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
const { bytes, deferred, file, flush, fs, stream } = testKit;

async function flushOptimization() {
	await flush();
	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, 0);
	});
	await flush();
}

function createBatchRecorder() {
	const seen: Array<Array<string>> = [];
	const batchOptimizer: BatchOptimizer = ({ atoms }) => {
		seen.push(atoms.map(({ type }) => type));
		return atoms;
	};

	return { batchOptimizer, seen };
}

test('optimization wrapper forwards queued atoms to batch optimizer', async () => {
	const remote = fs();
	const { batchOptimizer, seen } = createBatchRecorder();
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer,
		thisPool: new Set(),
	});

	const pending = Promise.all([wrapper.delete('folder/'), wrapper.mkdir('notes/')]);

	await flush();
	await pending;

	expect(seen).toStrictEqual([['delete', 'mkdir']]);
	expect(remote.calls.delete).toStrictEqual(['folder/']);
	expect(remote.calls.mkdir).toStrictEqual(['notes/']);
});

test('optimization wrapper anticipates write using transformed operation key', async () => {
	const local = fs();
	const localPool = new Set<string>();
	const { batchOptimizer, seen } = createBatchRecorder();
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thisPool: localPool,
	});
	const deleteDeferred = deferred<void>();
	const mkdirDeferred = deferred<void>();

	local.control.delete = () => deleteDeferred.promise;
	local.control.mkdir = () => mkdirDeferred.promise;

	const noteStat = file('folder/note.md', { uid: 'note-uid' });
	localPool.add(noteStat.key);
	expect(() => wrapper.read('transformed/note.md', noteStat)).toThrow('Terminate key needle.');

	const pendingBatch = Promise.all([wrapper.delete('folder/'), wrapper.mkdir('folder/sub/')]);
	await flushOptimization();

	expect(seen).toStrictEqual([['delete', 'mkdir', 'write']]);
	expect(local.calls.write).toStrictEqual([]);

	const pendingWrite = wrapper.write('transformed/note.md', bytes('body'), noteStat);
	deleteDeferred.resolve();
	mkdirDeferred.resolve();

	await Promise.all([pendingBatch, pendingWrite]);

	expect(local.calls.write).toStrictEqual([['transformed/note.md', bytes('body'), noteStat]]);
	expect(localPool).toStrictEqual(new Set());
});

test('optimization wrapper anticipates writeStream using transformed operation key', async () => {
	const local = fs();
	const localPool = new Set<string>();
	const { batchOptimizer, seen } = createBatchRecorder();
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thisPool: localPool,
	});
	const deleteDeferred = deferred<void>();
	const mkdirDeferred = deferred<void>();

	local.control.delete = () => deleteDeferred.promise;
	local.control.mkdir = () => mkdirDeferred.promise;

	const stat = file('folder/stream.md', { uid: 'stream-uid' });
	localPool.add(stat.key);
	expect(() => wrapper.read('transformed/stream.md', stat)).toThrow('Terminate key needle.');

	const pendingBatch = Promise.all([wrapper.delete('folder/'), wrapper.mkdir('folder/sub/')]);
	await flushOptimization();

	expect(seen).toStrictEqual([['delete', 'mkdir', 'write']]);
	expect(local.calls.writeStream).toStrictEqual([]);

	const pendingWriteStream = wrapper.writeStream('transformed/stream.md', stream(['body']), stat);
	deleteDeferred.resolve();
	mkdirDeferred.resolve();

	await Promise.all([pendingBatch, pendingWriteStream]);

	expect(local.calls.writeStream).toStrictEqual([['transformed/stream.md', stat]]);
});

test('optimization wrapper terminates only matching read needles', async () => {
	const local = fs();
	const localPool = new Set(['source/note.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: localPool,
	});
	const stat = file('source/note.md');

	await wrapper.readStream('transformed/note.md', stat);

	expect(local.calls.readStream).toStrictEqual([['transformed/note.md', stat]]);
	expect(localPool).toStrictEqual(new Set(['source/note.md']));
	expect(() => wrapper.read('transformed/note.md', stat)).toThrow('Terminate key needle.');
	expect(localPool).toStrictEqual(new Set());
});

test('optimization companion dispatches read discovery to opposite FS', async () => {
	const remote = fs();
	const local = fs();
	const localPool = new Set<string>();
	const wrapper = optimizationCompanionWrapper(remote.fs, {
		getThatFs: () => local.fs,
		thatPool: localPool,
	});
	const stat = file('note.md');

	await wrapper.read('remote/note.md', stat);
	await flush();

	expect(remote.calls.read).toStrictEqual([['remote/note.md', stat]]);
	expect(local.calls.read).toStrictEqual([['remote/note.md', stat]]);
	expect(localPool).toStrictEqual(new Set(['note.md']));
});

test('optimization companion dispatches read discovery for readStream through read', async () => {
	const remote = fs();
	const local = fs();
	const localPool = new Set<string>();
	const wrapper = optimizationCompanionWrapper(remote.fs, {
		getThatFs: () => local.fs,
		thatPool: localPool,
	});
	const stat = file('stream.md');

	await wrapper.readStream('remote/stream.md', stat);
	await flush();

	expect(remote.calls.readStream).toStrictEqual([['remote/stream.md', stat]]);
	expect(remote.calls.read).toStrictEqual([]);
	expect(local.calls.read).toStrictEqual([['remote/stream.md', stat]]);
	expect(local.calls.readStream).toStrictEqual([]);
});

test('optimization companion swallows failed discovery reads', async () => {
	const remote = fs();
	const local = fs({
		control: {
			read: () => Promise.reject(new Error('discovery failed')),
		},
	});
	const wrapper = optimizationCompanionWrapper(remote.fs, {
		getThatFs: () => local.fs,
		thatPool: new Set(),
	});

	const result = await Promise.resolve(wrapper.read('remote/note.md', file('note.md')));
	expect(result).toEqual(bytes(''));
	await flush();
});

test('optimization wrapper holds write arriving before flush until batch registration', async () => {
	const local = fs();
	const localPool = new Set(['note.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: localPool,
	});
	const stat = file('note.md');

	expect(() => wrapper.read('transformed/note.md', stat)).toThrow('Terminate key needle.');

	const pendingMkdir = wrapper.mkdir('folder/');
	const pendingWrite = wrapper.write('transformed/note.md', bytes('body'), stat);
	await flush();

	expect(local.calls.write).toStrictEqual([]);

	await flushOptimization();
	await Promise.all([pendingMkdir, pendingWrite]);

	expect(local.calls.write).toStrictEqual([['transformed/note.md', bytes('body'), stat]]);
});

test('optimization wrapper holds writeStream arriving before flush until batch registration', async () => {
	const local = fs();
	const localPool = new Set(['stream.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: localPool,
	});
	const stat = file('stream.md');

	expect(() => wrapper.read('transformed/stream.md', stat)).toThrow('Terminate key needle.');

	const pendingMkdir = wrapper.mkdir('folder/');
	const pendingWriteStream = wrapper.writeStream('transformed/stream.md', stream(['body']), stat);
	await flush();

	expect(local.calls.writeStream).toStrictEqual([]);

	await flushOptimization();
	await Promise.all([pendingMkdir, pendingWriteStream]);

	expect(local.calls.writeStream).toStrictEqual([['transformed/stream.md', stat]]);
});

test('optimization wrapper executes held write directly when no batch forms', async () => {
	const local = fs();
	const localPool = new Set(['note.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: () => {
			throw new Error('batch optimizer should not run');
		},
		thisPool: localPool,
	});
	const stat = file('note.md');

	expect(() => wrapper.read('transformed/note.md', stat)).toThrow('Terminate key needle.');

	const pendingWrite = wrapper.write('transformed/note.md', bytes('body'), stat);
	await flush();

	expect(local.calls.write).toStrictEqual([]);

	await flushOptimization();
	await pendingWrite;

	expect(local.calls.write).toStrictEqual([['transformed/note.md', bytes('body'), stat]]);
});

test('optimization wrapper bypasses batch optimizer for single call', async () => {
	const remote = fs();
	const batchOptimizer: BatchOptimizer = () => {
		throw new Error('batch optimizer should not run');
	};
	const recursiveValues: Array<boolean | undefined> = [];
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer,
		thisPool: new Set(),
	});

	remote.control.mkdir = (_key, recursive) => {
		recursiveValues.push(recursive);
	};

	await wrapper.mkdir('folder/nested/', true);

	expect(remote.calls.mkdir).toStrictEqual(['folder/nested/']);
	expect(recursiveValues).toStrictEqual([true]);
});

test('optimization wrapper propagates queued operation rejection', async () => {
	const remoteError = new Error('delete failed');
	const remote = fs({
		control: {
			delete: () => Promise.reject(remoteError),
		},
	});
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: new Set(),
	});

	let rejection: unknown;
	try {
		await wrapper.delete('folder/');
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(remoteError);
});

test('optimization wrapper propagates anticipated write rejection', async () => {
	const writeError = new Error('write failed');
	const local = fs({
		control: {
			write: () => Promise.reject(writeError),
		},
	});
	const localPool = new Set(['note.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: localPool,
	});
	const stat = file('note.md');

	expect(() => wrapper.read('transformed/note.md', stat)).toThrow();
	const pendingMkdir = wrapper.mkdir('folder/');
	await flushOptimization();
	const pendingWrite = wrapper.write('transformed/note.md', bytes('body'), stat);

	let rejection: unknown;
	try {
		await pendingWrite;
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(writeError);
	await pendingMkdir;
});

test('optimization wrapper rejects anticipated write before write arrives', async () => {
	const optimizerError = new Error('optimizer rejected write');
	const local = fs();
	const localPool = new Set(['note.md']);
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => {
			for (const atom of atoms) if (atom.type === 'write') atom.reject(optimizerError);
			return atoms;
		},
		thisPool: localPool,
	});
	const stat = file('note.md');

	expect(() => wrapper.read('transformed/note.md', stat)).toThrow();
	const pendingMkdir = wrapper.mkdir('folder/');
	await flushOptimization();
	const pendingWrite = wrapper.write('transformed/note.md', bytes('body'), stat);

	let rejection: unknown;
	try {
		await pendingWrite;
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(optimizerError);
	await pendingMkdir;
});

test('an anticipated write the optimizer resolves settles with its uid without writing', async () => {
	const local = fs();
	const wrapper = optimizationWrapper(local.fs, {
		batchOptimizer: ({ atoms }) => {
			for (const atom of atoms) if (atom.type === 'write') atom.resolve('optimized-uid');
			return atoms.filter((atom) => atom.type !== 'write');
		},
		thisPool: new Set(['note.md']),
	});
	const stat = file('note.md');

	expect(() => wrapper.read('transformed/note.md', stat)).toThrow();
	const pendingMkdir = wrapper.mkdir('folder/');
	await flushOptimization();
	const uid = await wrapper.write('transformed/note.md', bytes('body'), stat);

	expect(uid).toBe('optimized-uid');
	expect(local.calls.write).toStrictEqual([]);
	await pendingMkdir;
});

test('a queued atom rejected by the optimizer without ever being executed propagates', async () => {
	// A lone atom takes flush()'s single-op fast path and skips the optimizer entirely, so
	// this needs at least two queued atoms to reach the batch path that can reject one.
	const optimizerError = new Error('optimizer rejected without executing');
	const remote = fs();
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => {
			const [rejected, ...rest] = atoms;
			rejected?.reject(optimizerError);
			return rest;
		},
		thisPool: new Set(),
	});

	const rejectedPending = wrapper.delete('note.md');
	const keptPending = wrapper.mkdir('folder/');
	await flushOptimization();

	let rejection: unknown;
	try {
		await rejectedPending;
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(optimizerError);
	expect(remote.calls.delete).toStrictEqual([]);
	await keptPending;
	expect(remote.calls.mkdir).toStrictEqual(['folder/']);
});

test('a queued atom the optimizer resolves without ever executing settles without delegating', async () => {
	const remote = fs();
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => {
			const [resolved, ...rest] = atoms;
			(resolved as { resolve: () => void } | undefined)?.resolve();
			return rest;
		},
		thisPool: new Set(),
	});

	const resolvedPending = wrapper.delete('note.md');
	const keptPending = wrapper.mkdir('folder/');
	await flushOptimization();

	await resolvedPending;
	expect(remote.calls.delete).toStrictEqual([]);
	await keptPending;
	expect(remote.calls.mkdir).toStrictEqual(['folder/']);
});

test('the optimization wrapper delegates getUid, move, stat, exists and list unchanged', async () => {
	const remote = fs();
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thisPool: new Set(),
	});

	expect(wrapper.getUid()).toBe('uid');
	await wrapper.stat('note.md');
	await wrapper.exists('note.md');
	await wrapper.list('/', () => 'include');
	const pendingMove = wrapper.move('old.md', 'new.md');
	await flushOptimization();
	await pendingMove;

	expect(remote.calls.stat).toStrictEqual(['note.md']);
	expect(remote.calls.exists).toStrictEqual(['note.md']);
	expect(remote.calls.list).toStrictEqual(['/']);
	expect(remote.calls.move).toStrictEqual([['old.md', 'new.md']]);
});

test('the optimization companion delegates every operation to the original fs', async () => {
	const remote = fs();
	const companion = optimizationCompanionWrapper(remote.fs, {
		getThatFs: () => remote.fs,
		thatPool: new Set(),
	});
	const stat = file('note.md');

	expect(companion.getUid()).toBe('uid');
	await companion.write('note.md', bytes('x'), stat);
	await companion.writeStream('note.md', stream([bytes('x')]), stat);
	await companion.delete('note.md');
	await companion.mkdir('folder/', true);
	await companion.stat('note.md');
	await companion.exists('note.md');
	await companion.list('/', () => 'include');
	await companion.move('old.md', 'new.md');

	expect(remote.calls.write).toHaveLength(1);
	expect(remote.calls.writeStream).toHaveLength(1);
	expect(remote.calls.delete).toStrictEqual(['note.md']);
	expect(remote.calls.mkdir).toStrictEqual(['folder/']);
	expect(remote.calls.stat).toStrictEqual(['note.md']);
	expect(remote.calls.exists).toStrictEqual(['note.md']);
	expect(remote.calls.list).toStrictEqual(['/']);
	expect(remote.calls.move).toStrictEqual([['old.md', 'new.md']]);
});
