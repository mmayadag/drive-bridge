import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Platform: { isMacOS: true },
	apiVersion: '1.13.7',
}));

const { reportUrl } = await import('@/settings/support');

test('the report link opens a GitHub issue with the versions filled in', () => {
	const url = new URL(reportUrl());
	expect(url.origin + url.pathname).toBe('https://github.com/mmayadag/drive-bridge/issues/new');

	const body = url.searchParams.get('body') ?? '';
	expect(body).toContain('## What happened');
	expect(body).toContain('- Obsidian: 1.13.7');
	expect(body).toContain('- Platform: macOS');
	expect(body).toContain('Export logs to file');
	// The report says nothing about the vault or its owner.
	expect(body.toLowerCase()).not.toContain('vault');
	expect(body.toLowerCase()).not.toContain('token');
});

test('bug and request links carry their own template and label', () => {
	const bug = new URL(reportUrl('bug'));
	expect(bug.searchParams.get('labels')).toBe('bug');

	const request = new URL(reportUrl('request'));
	expect(request.searchParams.get('labels')).toBe('enhancement');
	const body = request.searchParams.get('body') ?? '';
	expect(body).toContain('## What you would like');
	expect(body).toContain('- Platform: macOS');
	expect(body).not.toContain('## What happened');
	expect(body).not.toContain('Export logs');
});
