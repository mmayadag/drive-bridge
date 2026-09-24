import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);
const { default: Scheduler } = await import('@/modules/scheduler');

function scheduler(paused: boolean) {
	const logs: Array<string> = [];
	const runs: Array<string> = [];
	const instance = new Scheduler({
		dispatch: (event: string, payload: string) => {
			if (event === 'logGeneral') logs.push(payload);
		},
		executeSync: (trigger: string) => {
			runs.push(trigger);
			return Promise.resolve({ result: 'completed' });
		},
		isIdle: Object.assign(() => true, { subscribe: () => () => {} }),
		reduceTriggers: (triggers: Array<string>) => ({ trigger: triggers[0] }),
		saveSettings: () => Promise.resolve(),
	} as never);
	Object.assign(instance, {
		settings: { automaticSyncPaused: paused, avoidAutoSyncWhenOffline: false },
	});
	return {
		logs,
		requestSync: instance.root.requestSync,
		runs,
		set: instance.root.setAutomaticSyncPaused,
	};
}

test('a paused device skips automatic syncs but runs manual ones', async () => {
	const { logs, requestSync, runs } = scheduler(true);
	expect(await requestSync('interval')).toStrictEqual({ result: 'cancelled' });
	expect(logs[0]).toContain('paused');
	expect(await requestSync('manual')).toStrictEqual({ result: 'completed' });
	expect(runs).toStrictEqual(['manual']);
});

test('resuming lets automatic syncs run again', async () => {
	const { requestSync, runs, set } = scheduler(true);
	set(false);
	await requestSync('interval');
	expect(runs).toStrictEqual(['interval']);
});
