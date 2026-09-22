import { expect, test } from 'bun:test';
import type { Translate } from '@/modules/i18n';
import type { HeadSettingTranslations } from '@/settings/head';
import { describeLastSync } from '@/settings/head';

const translate = ((key: string, arg?: { time: string; result: string }) =>
	key === 'lastSyncValue' && arg
		? `${arg.time} · ${arg.result}`
		: key) as Translate<HeadSettingTranslations>;

test('describes a vault that has never synced', () => {
	expect(describeLastSync(undefined, translate)).toBe('lastSyncNever');
});

test('describes a completed sync with its time', () => {
	const at = new Date(2026, 8, 22, 18, 42, 7).getTime();
	expect(describeLastSync({ at, result: 'completed' }, translate)).toBe(
		'2026-09-22 18:42:07 · completed',
	);
});

test('appends the error of a failed sync', () => {
	const at = new Date(2026, 8, 22, 18, 42, 7).getTime();
	expect(describeLastSync({ at, error: 'network down', result: 'failed' }, translate)).toBe(
		'2026-09-22 18:42:07 · failed: network down',
	);
});
