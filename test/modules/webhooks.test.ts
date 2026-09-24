import type { RequestUrlParam } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const posts: Array<RequestUrlParam> = [];
let failNext = false;

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestUrlParam) => {
		posts.push(params);
		return failNext
			? Promise.reject(new Error('endpoint down'))
			: Promise.resolve({ status: 200 });
	},
}));

const {
	default: Webhooks,
	buildFinishedEvent,
	buildStartedEvent,
	redactUrl,
} = await import('@/modules/webhooks');

type Listener = (payload: never) => void;

function setup(settings: {
	webhookOnStart?: string;
	webhookOnFinish?: string;
	webhookOnlyWhenChanged?: boolean;
}) {
	posts.length = 0;
	failNext = false;
	const listeners = new Map<string, Listener>();
	const logs: Array<string> = [];
	const webhooks = new Webhooks({
		app: { vault: { getName: () => 'Notes' } } as never,
		dispatch: ((_event: string, message: string) => void logs.push(message)) as never,
		on: (event: string, listener: Listener) => {
			listeners.set(event, listener);
			return () => void listeners.delete(event);
		},
	});
	Object.assign(webhooks, {
		settings: {
			webhookOnFinish: settings.webhookOnFinish ?? '',
			webhookOnStart: settings.webhookOnStart ?? '',
			webhookOnlyWhenChanged: settings.webhookOnlyWhenChanged ?? true,
		},
	});
	webhooks.start();
	const emit = (event: string, payload: unknown) => listeners.get(event)?.(payload as never);
	return { emit, logs, webhooks };
}

const body = (index: number) => JSON.parse(posts[index]?.body as string) as Record<string, unknown>;

test('builds the payloads', () => {
	expect(buildStartedEvent('Notes', 'manual', 3)).toMatchObject({
		event: 'sync-started',
		tasks: 3,
		trigger: 'manual',
		vault: 'Notes',
	});
	expect(buildStartedEvent('Notes', 'manual')).not.toHaveProperty('tasks');
	expect(
		buildFinishedEvent('Notes', { result: 'completed' }, { completed: 2, failed: 0 }),
	).toMatchObject({ completed: 2, event: 'sync-finished', failed: 0, result: 'completed' });
	expect(
		buildFinishedEvent(
			'Notes',
			{ error: 'boom', result: 'failed' },
			{ completed: 1, failed: 1 },
		),
	).toMatchObject({ error: 'boom', failed: 1, result: 'failed' });
});

test('holds the start until there is work, and counts what ran', async () => {
	const { emit } = setup({
		webhookOnFinish: 'https://hook/end',
		webhookOnStart: 'https://hook/start',
	});

	emit('syncStarted', { trigger: 'interval' });
	expect(posts).toHaveLength(0);

	emit('executionStarted', [{}, {}]);
	emit('taskCompleted', {});
	emit('taskFailed', {});
	emit('syncTerminated', { error: 'one task failed', result: 'failed' });
	await Promise.resolve();

	expect(posts).toHaveLength(2);
	expect(body(0)).toMatchObject({ event: 'sync-started', tasks: 2, trigger: 'interval' });
	expect(body(1)).toMatchObject({
		completed: 1,
		error: 'one task failed',
		event: 'sync-finished',
		failed: 1,
	});
});

test('says nothing about a sync that found nothing to do', () => {
	const { emit } = setup({
		webhookOnFinish: 'https://hook/end',
		webhookOnStart: 'https://hook/start',
	});

	emit('syncStarted', { trigger: 'interval' });
	emit('syncTerminated', { result: 'noop' });

	expect(posts).toHaveLength(0);
});

test('reports every sync when the filter is off', () => {
	const { emit } = setup({
		webhookOnFinish: 'https://hook/end',
		webhookOnStart: 'https://hook/start',
		webhookOnlyWhenChanged: false,
	});

	emit('syncStarted', { trigger: 'interval' });
	emit('syncTerminated', { result: 'noop' });

	expect(posts).toHaveLength(2);
	expect(body(0)).not.toHaveProperty('tasks');
	expect(body(1)).toMatchObject({ completed: 0, failed: 0, result: 'noop' });
});

test('sends nothing when no URL is configured', () => {
	const { emit } = setup({});
	emit('syncStarted', { trigger: 'manual' });
	emit('executionStarted', [{}]);
	emit('syncTerminated', { result: 'completed' });
	expect(posts).toHaveLength(0);
});

test('counters start fresh for each sync', async () => {
	const { emit } = setup({ webhookOnFinish: 'https://hook/end' });

	emit('syncStarted', { trigger: 'manual' });
	emit('taskCompleted', {});
	emit('syncTerminated', { result: 'completed' });
	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'completed' });
	await Promise.resolve();

	expect(body(1)).toMatchObject({ completed: 0 });
});

test('logs a failing endpoint instead of throwing', async () => {
	const { emit, logs } = setup({ webhookOnFinish: 'https://hook/end' });
	failNext = true;

	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'completed' });
	await Promise.resolve();
	await Promise.resolve();

	expect(logs.join(' ')).toContain('endpoint down');
});

test('logs the webhook origin, never the token in its path or query', async () => {
	expect(redactUrl('https://hooks.example.com/services/T123/B456?token=secret')).toBe(
		'https://hooks.example.com/…',
	);
	expect(redactUrl('not a url')).toBe('the webhook');

	const { emit, logs } = setup({ webhookOnFinish: 'https://hooks.example.com/abc?token=s3cret' });
	failNext = true;
	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated', { result: 'completed' });
	await Promise.resolve();
	await Promise.resolve();

	expect(logs.join(' ')).not.toContain('s3cret');
	expect(logs.join(' ')).toContain('https://hooks.example.com/…');
});

test('a slow endpoint is logged while the post is still pending', () => {
	const originalSet = window.setTimeout;
	const scheduled: Array<() => void> = [];
	window.setTimeout = ((fn: () => void) => {
		scheduled.push(fn);
		return 0;
	}) as never;
	try {
		const { emit, logs } = setup({ webhookOnFinish: 'https://hook.example.com/secret' });
		emit('syncTerminated', { result: 'completed' });
		expect(scheduled).toHaveLength(1);
		scheduled[0]?.();
		expect(logs).toStrictEqual(['Webhook to `https://hook.example.com/…` is taking long.']);
	} finally {
		window.setTimeout = originalSet;
	}
});

test('dispose stops listening to sync events', () => {
	const { emit, webhooks } = setup({ webhookOnFinish: 'https://hook/end' });
	webhooks.dispose();
	emit('syncTerminated', { result: 'completed' });
	expect(posts).toHaveLength(0);
});
