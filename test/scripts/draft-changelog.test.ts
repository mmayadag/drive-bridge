import { expect, test } from 'bun:test';
import { draftSection } from '../../scripts/draft-changelog';

const issue = (number: number, title: string, label = 'enhancement') => ({
	labels: [{ name: label }],
	number,
	title,
});

test('lists changes, then fixes, each by issue number', () => {
	const draft = draftSection(
		'0.1.8',
		[
			issue(16, 'Marker fields are cut off', 'bug'),
			issue(17, 'Drop the backend row'),
			issue(14, 'Report buttons'),
			issue(15, 'Confirm clearing', 'bug'),
		],
		'2026-09-23',
	);
	expect(draft).toBe(
		[
			'## v0.1.8 - 2026-09-23',
			'',
			'- Report buttons (#14).',
			'- Drop the backend row (#17).',
			'',
			'Fixes:',
			'',
			'- Confirm clearing (#15).',
			'- Marker fields are cut off (#16).',
		].join('\n'),
	);
});

test('leaves out the fixes block when there are none', () => {
	expect(draftSection('0.1.9', [issue(20, 'Sub-pages')], '2026-09-23')).toBe(
		'## v0.1.9 - 2026-09-23\n\n- Sub-pages (#20).',
	);
});

test('leaves out the blank separator when there are only fixes', () => {
	expect(draftSection('0.1.10', [issue(21, 'Crash on startup', 'bug')], '2026-09-23')).toBe(
		['## v0.1.10 - 2026-09-23', '', 'Fixes:', '', '- Crash on startup (#21).'].join('\n'),
	);
});

test('an empty milestone drafts just the header', () => {
	expect(draftSection('0.1.11', [], '2026-09-23')).toBe('## v0.1.11 - 2026-09-23\n');
});
