// Coverage only sees files some test imports, so a file no test touches would be left out
// of the totals instead of counting as untested. Importing every source file here puts
// each of them in the report, with whatever the other tests exercise.

import { expect, test } from 'bun:test';

const files = await Array.fromAsync(new Bun.Glob('src/**/*.ts').scan());
const sources = files.filter((file) => !file.endsWith('.d.ts')).toSorted();

test('every source file loads', async () => {
	for (const file of sources) await import(`../${file}`);
	expect(sources.length).toBeGreaterThan(100);
});
