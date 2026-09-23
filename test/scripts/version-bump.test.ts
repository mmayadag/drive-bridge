import { expect, test } from 'bun:test';
import type { ReleaseFiles } from '../../scripts/version-bump';
import {
	bump,
	changelogSection,
	check,
	compareVersions,
	parseVersion,
} from '../../scripts/version-bump';

const CHANGELOG = `# Changelog

Intro.

## v0.1.9 - 2026-09-23

- Pages.

## v0.1.8 - 2026-09-22

- Buttons.
`;

const files = (changelog = CHANGELOG): ReleaseFiles => ({
	changelog,
	manifest: { minAppVersion: '1.13.0', version: '0.1.9' },
	pkg: { version: '0.1.9' },
	versions: { '0.1.8': '1.13.0', '0.1.9': '1.13.0' },
});

test('parses and compares versions, including prereleases', () => {
	expect(parseVersion('0.1.10')).toStrictEqual([0, 1, 10]);
	expect(parseVersion('1.2.3-beta.1')).toStrictEqual([1, 2, 3]);
	expect(parseVersion('v1.2')).toBeUndefined();
	expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0);
	expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0);
});

test('reads one changelog section', () => {
	expect(changelogSection(CHANGELOG, '0.1.9')).toBe('- Pages.');
	expect(changelogSection(CHANGELOG, '0.1.8')).toBe('- Buttons.');
	expect(changelogSection(CHANGELOG, '0.1.7')).toBeUndefined();
});

test('refuses a version that is not newer', () => {
	expect(bump(files(), '0.1.9', '2026-09-24').status).toBe('invalid');
	expect(bump(files(), '0.1.8', '2026-09-24').status).toBe('invalid');
	expect(bump(files(), 'next', '2026-09-24').status).toBe('invalid');
});

test('adds an empty changelog heading and waits for notes', () => {
	const result = bump(files(), '0.1.10', '2026-09-24');
	expect(result.status).toBe('needsNotes');
	if (result.status !== 'needsNotes') return;
	expect(result.files.changelog).toContain('Intro.\n\n## v0.1.10 - 2026-09-24\n\n\n## v0.1.9');
	expect(result.files.manifest.version).toBe('0.1.9');

	// Running again before writing notes still waits.
	expect(bump(result.files, '0.1.10', '2026-09-24').status).toBe('needsNotes');
});

test('bumps every file once the notes are written', () => {
	const changelog = CHANGELOG.replace(
		'## v0.1.9',
		'## v0.1.10 - 2026-09-24\n\n- Tools.\n\n## v0.1.9',
	);
	const result = bump(files(changelog), '0.1.10', '2026-09-24');
	expect(result.status).toBe('bumped');
	if (result.status !== 'bumped') return;
	expect(result.files.manifest.version).toBe('0.1.10');
	expect(result.files.pkg.version).toBe('0.1.10');
	expect(result.files.versions['0.1.10']).toBe('1.13.0');
	expect(check(result.files, '0.1.10')).toStrictEqual([]);
});

test('check reports every mismatch', () => {
	expect(check(files())).toStrictEqual([]);
	expect(check(files(), '0.1.9-beta.1')).toStrictEqual([]);
	const broken = { ...files(), pkg: { version: '0.1.8' }, versions: {} };
	expect(check(broken, '0.2.0')).toStrictEqual([
		'package.json is 0.1.8, manifest.json is 0.1.9.',
		'versions.json maps 0.1.9 to nothing, manifest.json says minAppVersion 1.13.0.',
		'Tag 0.2.0 does not match manifest version 0.1.9.',
	]);
	expect(check(files('# Changelog\n'))).toStrictEqual(['CHANGELOG.md has no notes for v0.1.9.']);
});
