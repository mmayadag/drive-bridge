import { expect, test } from 'bun:test';
import ReadWriteGate from '@/shared/read-write-gate';

// A task that finishes only when the test says so, so the order of the gate is observable.
function pending<T>(value: T) {
	let release!: () => void;
	const started = { done: false };
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		release,
		started,
		task: async () => {
			started.done = true;
			await gate;
			return value;
		},
	};
}

test('readers run together', async () => {
	const gate = new ReadWriteGate();
	const first = pending('a');
	const second = pending('b');

	const both = Promise.all([gate.shared(first.task), gate.shared(second.task)]);
	await Promise.resolve();
	expect(first.started.done).toBe(true);
	expect(second.started.done).toBe(true);

	first.release();
	second.release();
	expect(await both).toStrictEqual(['a', 'b']);
});

test('a writer waits for the readers, and a later reader waits for the writer', async () => {
	const gate = new ReadWriteGate();
	const reader = pending('read');
	const writer = pending('write');
	const latecomer = pending('late');
	const order: Array<string> = [];

	const readerRun = gate.shared(reader.task).then((value) => void order.push(value));
	await Promise.resolve();

	const writerRun = gate.exclusive(writer.task).then((value) => void order.push(value));
	await Promise.resolve();
	expect(writer.started.done).toBe(false);

	// This read arrives while the writer is queued, so it must not slip in front of it.
	const lateRun = gate.shared(latecomer.task).then((value) => void order.push(value));
	await Promise.resolve();
	expect(latecomer.started.done).toBe(false);

	reader.release();
	await readerRun;
	expect(writer.started.done).toBe(true);
	expect(latecomer.started.done).toBe(false);

	writer.release();
	await writerRun;
	await Promise.resolve();
	expect(latecomer.started.done).toBe(true);

	latecomer.release();
	await lateRun;
	expect(order).toStrictEqual(['read', 'write', 'late']);
});

test('downgrade hands the lock to readers without letting go', async () => {
	const gate = new ReadWriteGate();
	const finished: Array<string> = [];

	await gate.exclusive(() =>
		gate.downgrade(async () => {
			const reader = gate.shared(() => Promise.resolve(void finished.push('reader')));
			await Promise.resolve();
			await reader;
			finished.push('downgraded');
		}),
	);

	expect(finished).toStrictEqual(['reader', 'downgraded']);
});

test('a failing task still releases the lock', async () => {
	const gate = new ReadWriteGate();
	let caught: unknown;
	try {
		await gate.exclusive(() => Promise.reject(new Error('boom')));
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('boom');
	expect(await gate.shared(() => Promise.resolve('after'))).toBe('after');
});
