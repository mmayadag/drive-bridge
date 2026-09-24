import { expect, test } from 'bun:test';
import { describeProgress } from '@/modules/progress-view';

const t = ((key: string) => key) as never;
const walk = () => ({ completed: 2, current: 'notes/', total: 8 });
const run = () => ({ completed: 1, current: { key: 'a.md', name: 'push' }, total: 3 });
const view = (stage: string) => describeProgress(stage as never, walk, run as never, t);

test('awaiting confirmation shows no count or bar, whatever the task count', () => {
	expect(view('awaitingConfirmation')).toStrictEqual({
		counter: false,
		current: 'awaitingConfirmation',
	});
});

test('running counts the real tasks', () => {
	expect(view('executing')).toStrictEqual({
		completed: 1,
		current: 'push a.md',
		percent: 33.33,
		total: 3,
	});
	expect(view('walkingRemote')).toMatchObject({
		completed: 2,
		current: 'walkingRemote notes/',
		total: 8,
	});
});

test('the end states say how it ended', () => {
	expect(view('completed')).toStrictEqual({ current: 'completed' });
	expect(view('cancelled')).toStrictEqual({ current: 'cancelled' });
	expect(view('completedNoop')).toMatchObject({ percent: 100, total: 0 });
	expect(view('none')).toStrictEqual({});
	expect(view('failed')).toStrictEqual({ current: 'failed' });
});
