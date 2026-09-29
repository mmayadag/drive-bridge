// The Obsidian store review lints the source with its own ESLint config, which turns
// disabling many of its rules (no-restricted-globals, no-console, obsidianmd/*, ...) into an
// error that fails the review (#136). This repo lints with oxlint, so ESLint comments have
// no use here; any of them in src/ is a review failure waiting to happen. The review also
// checks the manifest description (#206).

import { expect, test } from 'bun:test';

test('src/ has no ESLint disable comments', async () => {
	const found: Array<string> = [];
	for await (const path of new Bun.Glob('src/**/*.{ts,js}').scan()) {
		const lines = (await Bun.file(path).text()).split('\n');
		lines.forEach((line, index) => {
			if (/eslint-(?:disable|enable)/u.test(line)) found.push(`${path}:${index + 1}`);
		});
	}
	expect(found).toStrictEqual([]);
});

test('the manifest description passes the directory review', async () => {
	const { description } = (await Bun.file('manifest.json').json()) as { description: string };
	expect(description).not.toMatch(/obsidian/iu);
	expect(description).not.toMatch(/^this is a plugin/iu);
	expect(description.length).toBeLessThanOrEqual(250);
	expect(description).toEndWith('.');
});
