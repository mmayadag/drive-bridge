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
