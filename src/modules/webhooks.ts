import type { Events } from '@';
import type { App } from 'obsidian';
import { requestUrl } from 'obsidian';
import { getMessage } from '@/shared/error';
import type { Dispatch, On } from './event-bus';
import type { SyncTerminateReason } from './sync';

export type StartedEvent = {
	event: 'sync-started';
	vault: string;
	at: string;
	trigger: string;
	/** Planned operations, when the sync got as far as planning them. */
	tasks?: number;
};

export type FinishedEvent = {
	event: 'sync-finished';
	vault: string;
	at: string;
	result: SyncTerminateReason['result'];
	completed: number;
	failed: number;
	error?: string;
};

export type WebhookEvent = StartedEvent | FinishedEvent;

type Counts = { completed: number; failed: number };

const SLOW_WARNING = 10_000;

/** Webhook URLs often carry a token in the query or path; logs only get the origin. */
export function redactUrl(url: string): string {
	try {
		return `${new URL(url).origin}/…`;
	} catch {
		return 'the webhook';
	}
}

export function buildStartedEvent(vault: string, trigger: string, tasks?: number): StartedEvent {
	return {
		at: new Date().toISOString(),
		event: 'sync-started',
		trigger,
		vault,
		...(tasks === undefined ? {} : { tasks }),
	};
}

export function buildFinishedEvent(
	vault: string,
	reason: SyncTerminateReason,
	counts: Counts,
): FinishedEvent {
	return {
		at: new Date().toISOString(),
		completed: counts.completed,
		event: 'sync-finished',
		failed: counts.failed,
		result: reason.result,
		vault,
		...(reason.result === 'failed' ? { error: reason.error } : {}),
	};
}

export async function postWebhook(url: string, payload: WebhookEvent): Promise<void> {
	await requestUrl({
		body: JSON.stringify(payload),
		contentType: 'application/json',
		method: 'POST',
		throw: true,
		url,
	});
}

/**
 * Posts a small JSON body to URLs of the user's choosing when a sync starts and when it
 * ends. Failures are logged and never affect the sync. With `webhookOnlyWhenChanged` the
 * start is held back until the sync has actually planned work, and a sync that found
 * nothing to do reports nothing.
 */
export default class Webhooks {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private counts: Counts = { completed: 0, failed: 0 };
	private trigger = '';

	declare readonly settings: {
		webhookOnStart: string;
		webhookOnFinish: string;
		webhookOnlyWhenChanged: boolean;
	};

	constructor(
		private readonly ctx: {
			on: On<Events>;
			dispatch: Dispatch<Events>;
			app: App;
		},
	) {}

	private readonly send = (url: string, payload: WebhookEvent) => {
		if (!url) return;
		const shown = redactUrl(url);
		const slow = window.setTimeout(
			() => this.ctx.dispatch('errorGeneral', `Webhook to \`${shown}\` is taking long.`),
			SLOW_WARNING,
		);
		postWebhook(url, payload)
			.catch((error: unknown) =>
				this.ctx.dispatch(
					'errorGeneral',
					`Webhook to \`${shown}\` failed: ${getMessage(error)}`,
				),
			)
			.finally(() => window.clearTimeout(slow));
	};

	readonly start = () => {
		const { on, app } = this.ctx;
		const vault = app.vault.getName();
		const onlyWhenChanged = () => this.settings.webhookOnlyWhenChanged;

		this.cleanupCallbacks.push(
			on('syncStarted', ({ trigger }) => {
				this.counts = { completed: 0, failed: 0 };
				this.trigger = trigger;
				if (!onlyWhenChanged())
					this.send(this.settings.webhookOnStart, buildStartedEvent(vault, trigger));
			}),
			on('executionStarted', (tasks) => {
				if (onlyWhenChanged())
					this.send(
						this.settings.webhookOnStart,
						buildStartedEvent(vault, this.trigger, tasks.length),
					);
			}),
			on('taskCompleted', () => void this.counts.completed++),
			on('taskFailed', () => void this.counts.failed++),
			on('syncTerminated', (reason) => {
				if (onlyWhenChanged() && reason.result === 'noop') return;
				this.send(
					this.settings.webhookOnFinish,
					buildFinishedEvent(vault, reason, this.counts),
				);
			}),
		);
	};

	readonly dispose = () => this.cleanupCallbacks.splice(0).forEach((fn) => fn());
}
