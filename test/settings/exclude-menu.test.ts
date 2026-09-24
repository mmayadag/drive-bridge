import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const { ruleFor, toggleExclusion } = await import('@/settings/exclude-menu');
const { prepareGlobMatch } = await import('@/utils/glob-match');

test('a file rule matches that file only', () => {
	const match = prepareGlobMatch(
		[],
		[{ caseSensitive: true, expr: ruleFor('notes/a.md', false) }],
	);
	expect(match('notes/a.md')).toBe('exclude');
	expect(match('other/notes/a.md')).not.toBe('exclude');
	expect(match('notes/A.md')).not.toBe('exclude');
});

test('a folder rule matches that folder and not a file of the same name', () => {
	const match = prepareGlobMatch([], [{ caseSensitive: true, expr: ruleFor('Archive', true) }]);
	expect(match('Archive/')).toBe('exclude');
	expect(match('Archive')).not.toBe('exclude');
	expect(match('Old/Archive/')).not.toBe('exclude');
});

test('toggling adds the rule once and removes it again', () => {
	const added = toggleExclusion([{ caseSensitive: false, expr: '.git' }], '/a.md');
	expect(added).toStrictEqual({
		excluded: true,
		rules: [
			{ caseSensitive: false, expr: '.git' },
			{ caseSensitive: true, expr: '/a.md' },
		],
	});
	expect(toggleExclusion(added.rules, '/a.md')).toStrictEqual({
		excluded: false,
		rules: [{ caseSensitive: false, expr: '.git' }],
	});
});
