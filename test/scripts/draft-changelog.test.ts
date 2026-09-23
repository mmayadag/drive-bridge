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
