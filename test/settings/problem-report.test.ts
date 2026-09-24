import { expect, test } from 'bun:test';
import { buildReport, sanitizeSettings } from '@/settings/problem-report';

const settings = {
	customHeaders: [{ key: 'Authorization', type: 'plaintext', value: 'Bearer abc' }],
	decider: 'bidirectional',
	keptOnRemote: { 'private/diary.md': 'r1' },
	modules: {
		gdrive: {
			accountEmail: 'me@example.com',
			baseDirectory: 'vault/',
			clientId: '1-abc.apps.googleusercontent.com',
			userId: '42',
		},
	},
	skipState: { failures: { 'secret.md': 1 }, skipped: ['secret.md'] },
	syncHistory: [
		{
			at: 1,
			counts: { uploaded: 1 },
			error: 'Google Drive: private/plan.md does not exist.',
			result: 'failed',
			trigger: 'interval',
		},
	],
	webhookOnFinish: '',
	webhookOnStart: 'https://hooks.example.com/token123',
};

test('secrets, addresses and file names do not reach the report', () => {
	const text = JSON.stringify(sanitizeSettings(settings));
	for (const leak of [
		'Bearer abc',
		'me@example.com',
		'googleusercontent',
		'token123',
		'diary',
		'secret.md',
		'"42"',
	])
		expect(text).not.toContain(leak);
	expect(sanitizeSettings(settings)).toMatchObject({
		decider: 'bidirectional',
		keptOnRemote: '1 file(s)',
		skipState: '1 file(s) skipped',
		webhookOnFinish: '',
		webhookOnStart: '<set>',
	});
	// The input is left alone.
	expect(settings.webhookOnStart).toContain('token123');
});

test('the report ends with the last log lines', () => {
	const log = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
	const report = buildReport({
		log,
		obsidian: '1.13.7',
		platform: 'iOS',
		plugin: '0.3.0',
		settings,
	});
	expect(report).toContain('- Platform: iOS');
	expect(report).toContain('line 399');
	expect(report).toContain('line 100');
	expect(report).not.toContain('line 99\n');
});
