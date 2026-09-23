import type { Events } from '@';
import type { App, EventRef, TAbstractFile } from 'obsidian';
import type { Ref } from '@/shared/reactive';
import type { GlobMatchRule, TogglableValue } from '@/types';
import { prepareGlobMatch } from '@/utils/glob-match';
import untilTrue from '@/utils/until-true';
import type { Dispatch } from './event-bus';
import type { SyncStage } from './observability';
import type { SyncOptions, SyncTerminateReason } from './sync';

const LEAVE_SYNC_COOLDOWN = 60_000;

type SyncRequest = {
	trigger: string;
	resolve: (result: SyncTerminateReason) => void;
};

export default class Scheduler {
	private readonly pendingRequests: Array<SyncRequest> = [];
	private isScheduling = false;
	private realtimeSyncTimer?: number;
	private scheduledSyncTimer?: number;
	private startupSyncTimer?: number;
	private hasLocalChanges = false;
	private lastLeaveSync = 0;
	private readonly domCleanups: Array<() => void> = [];

	constructor(
		private readonly ctx: {
			syncStage: Ref<SyncStage>;
			executeSync: (trigger: string, options?: SyncOptions) => Promise<SyncTerminateReason>;
			registerEvent: (ref: EventRef) => void;
			reduceTriggers: (triggers: Array<string>) => { trigger: string; options?: SyncOptions };
			app: App;
			isIdle: Ref<boolean>;
			dispatch: Dispatch<Events>;
		},
	) {}

	declare settings: {
		startupSync: TogglableValue;
		scheduledSync: TogglableValue;
		realtimeSync: TogglableValue;
		syncOnLeave: boolean;
		exclusionRules: Array<GlobMatchRule>;
		inclusionRules: Array<GlobMatchRule>;
		avoidAutoSyncWhenOffline: boolean;
	};

	private readonly requestSync = (trigger: string): Promise<SyncTerminateReason> => {
		if (
			!navigator.onLine &&
			this.settings.avoidAutoSyncWhenOffline &&
			trigger !== 'manual' &&
			trigger !== 'nonInteractiveManual'
		) {
			this.ctx.dispatch(
				'logGeneral',
				`Skipped offline auto sync with trigger \`${trigger}\`.`,
			);
			return Promise.resolve({ error: 'Device is offline.', result: 'failed' });
		}
		this.hasLocalChanges = false;
		return new Promise((resolve) => {
			this.pendingRequests.push({ resolve, trigger });
			void this.scheduleFlush();
		});
	};

	start = () => {
		const { workspace, vault } = this.ctx.app;
		workspace.onLayoutReady(() => {
			this.ctx.registerEvent(vault.on('create', this.onChange));
			this.ctx.registerEvent(vault.on('delete', this.onChange));
			this.ctx.registerEvent(vault.on('modify', this.onChange));
			this.ctx.registerEvent(vault.on('rename', this.onChange));
		});
		this.listenForLeaving();
		const { scheduledSync, startupSync } = this.settings;
		const schedule = () => {
			if (scheduledSync.enabled) this.startScheduledSync();
		};
		if (startupSync.enabled)
			this.startupSyncTimer = window.setTimeout(() => {
				void this.requestSync('startup').finally(schedule);
			}, startupSync.value);
		else schedule();
	};

	// Leaving Obsidian (switching apps on mobile, another window on desktop) is the last
	// chance to push what was just written before the device may go to sleep.
	private readonly listenForLeaving = () => {
		const onLeave = () => {
			if (!this.settings.syncOnLeave || !this.hasLocalChanges) return;
			// Switching back and forth between apps should not mean a sync every time.
			if (Date.now() - this.lastLeaveSync < LEAVE_SYNC_COOLDOWN) return;
			this.lastLeaveSync = Date.now();
			void this.requestSync('leave');
		};
		const onVisibilityChange = () => {
			if (document.hidden) onLeave();
		};
		window.addEventListener('blur', onLeave);
		document.addEventListener('visibilitychange', onVisibilityChange);
		this.domCleanups.push(
			() => window.removeEventListener('blur', onLeave),
			() => document.removeEventListener('visibilitychange', onVisibilityChange),
		);
	};

	dispose = () => {
		while (this.domCleanups.length > 0) this.domCleanups.pop()?.();
		while (this.pendingRequests.length > 0) {
			const request = this.pendingRequests.shift();
			request?.resolve({ result: 'cancelled' });
		}
		if (this.realtimeSyncTimer) {
			window.clearTimeout(this.realtimeSyncTimer);
			this.realtimeSyncTimer = undefined;
		}
		if (this.startupSyncTimer) {
			window.clearTimeout(this.startupSyncTimer);
			this.startupSyncTimer = undefined;
		}
		this.stopScheduledSync();
	};

	private readonly startScheduledSync = () => {
		if (this.scheduledSyncTimer) window.clearInterval(this.scheduledSyncTimer);
		this.scheduledSyncTimer = window.setInterval(
			() => void this.requestSync('interval'),
			this.settings.scheduledSync.value,
		);
	};

	private readonly stopScheduledSync = () => {
		if (this.scheduledSyncTimer) {
			window.clearInterval(this.scheduledSyncTimer);
			this.scheduledSyncTimer = undefined;
		}
	};

	private readonly onChange = (file: TAbstractFile, old?: string) => {
		if (this.ctx.syncStage() === 'executing') return;
		const { realtimeSync, exclusionRules, inclusionRules } = this.settings;

		const match = prepareGlobMatch(inclusionRules, exclusionRules);
		if (match(file.path) === 'exclude' && !(old && match(old) !== 'exclude')) return;
		this.hasLocalChanges = true;

		if (!realtimeSync.enabled) return;
		if (this.realtimeSyncTimer) window.clearTimeout(this.realtimeSyncTimer);
		this.realtimeSyncTimer = window.setTimeout(
			() => void this.requestSync('realtime'),
			realtimeSync.value,
		);
	};

	private readonly scheduleFlush = async () => {
		if (this.pendingRequests.length === 0 || this.isScheduling) return;
		this.isScheduling = true;
		await untilTrue(this.ctx.isIdle, 'stop');
		this.ctx.isIdle(false);
		void this.flush();
		this.isScheduling = false;
	};

	private readonly flush = async () => {
		const { executeSync, reduceTriggers } = this.ctx;
		const batch = this.pendingRequests.splice(0);
		const triggers = batch.map(({ trigger }) => trigger);
		const { trigger, options } = reduceTriggers(triggers);
		const result = await executeSync(trigger, options);
		for (const request of batch) request.resolve(result);
	};

	root = {
		requestSync: this.requestSync,
		startScheduledSync: this.startScheduledSync,
		stopScheduledSync: this.stopScheduledSync,
	};
}
