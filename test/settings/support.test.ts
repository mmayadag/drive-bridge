import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Platform: { isMacOS: true },
	apiVersion: '1.13.7',
}));

const { coffeeQuestion, reportUrl } = await import('@/settings/support');

test('the report links open the matching issue form with the versions filled in', () => {
	for (const kind of ['bug', 'request'] as const) {
		const url = new URL(reportUrl(kind));
		expect(url.origin + url.pathname).toBe(
			'https://github.com/mmayadag/drive-bridge/issues/new',
		);
		expect(url.searchParams.get('template')).toBe(`${kind}.yml`);
		expect(url.searchParams.get('obsidian')).toBe('1.13.7');
		expect(url.searchParams.get('platform')).toBe('macOS');
		expect(url.searchParams.get('plugin')).toBeTruthy();
		// The report says nothing about the vault or its owner.
		expect(url.href.toLowerCase()).not.toContain('vault');
		expect(url.href.toLowerCase()).not.toContain('token');
	}
});

test('the form field names in the link exist in both issue forms', async () => {
	const url = new URL(reportUrl('bug'));
	const fields = [...url.searchParams.keys()].filter((key) => key !== 'template');
	for (const form of ['bug', 'request']) {
		const yaml = await Bun.file(`.github/ISSUE_TEMPLATE/${form}.yml`).text();
		for (const field of fields) expect(yaml).toContain(`id: ${field}\n`);
	}
});

test('the coffee line follows the last sync', () => {
	expect(coffeeQuestion()).toBe('coffeeSetUp');
	expect(coffeeQuestion({ at: 1, result: 'completed' })).toBe('coffeeWorks');
	expect(coffeeQuestion({ at: 1, result: 'noop' })).toBe('coffeeWorks');
	expect(coffeeQuestion({ at: 1, error: 'offline', result: 'failed' })).toBe('coffeeFailed');
	expect(coffeeQuestion({ at: 1, result: 'cancelled' })).toBe('coffeeQuestion');
});
