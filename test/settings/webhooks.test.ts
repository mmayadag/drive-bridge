import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const { parseWebhookUrl } = await import('@/settings/webhooks');

test('an empty field turns the webhook off', () => {
	expect(parseWebhookUrl('')).toBe('');
	expect(parseWebhookUrl('   ')).toBe('');
});

test('accepts an https URL and trims it', () => {
	expect(parseWebhookUrl('  https://hooks.example.com/abc  ')).toBe(
		'https://hooks.example.com/abc',
	);
});

test('rejects plain http and half-typed addresses without throwing', () => {
	// The settings field calls this on every keystroke, so it must never throw.
	expect(parseWebhookUrl('http://hooks.example.com/abc')).toBeUndefined();
	expect(parseWebhookUrl('h')).toBeUndefined();
	expect(parseWebhookUrl('https:/')).toBeUndefined();
	expect(parseWebhookUrl('ftp://example.com')).toBeUndefined();
	// oxlint-disable-next-line eslint/no-script-url -- the point is that it is rejected
	expect(parseWebhookUrl('javascript:alert(1)')).toBeUndefined();
});
