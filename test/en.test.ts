// Every translation that takes a value, called with a few values: nothing may render as
// "undefined" or "NaN", which is what a renamed field or a wrong argument looks like on screen.

import { expect, test } from 'bun:test';
import en from '@/en';
import gdriveEn from '@/gdrive/i18n';

// Destructuring translations get an object whose every field is n; the others get n itself.
function render(fn: (value: unknown) => unknown, n: number) {
	const destructures = /^\(?\s*\{/u.test(String(fn));
	const argument = destructures ? new Proxy({}, { get: () => n }) : n;
	const out = fn(argument);
	return typeof out === 'string' ? out : ((out as Node).textContent ?? '');
}

for (const [name, table] of Object.entries({ en, gdriveEn }))
	test(`${name}: every translation with a value renders cleanly`, () => {
		const functions = Object.entries(table).filter(([, value]) => typeof value === 'function');
		expect(functions.length).toBeGreaterThan(0);
		for (const [key, fn] of functions)
			for (const n of [0, 1, 2]) {
				const text = render(fn as never, n);
				// The key is in the checked text, so a failure names the translation.
				expect(`${key}: ${text}`).not.toMatch(/undefined|NaN/u);
				expect(text.trim().length).toBeGreaterThan(0);
			}
	});

test('counts read as one item or several', () => {
	expect(en.errorTasksFailed(1)).toBe('1 file could not be synced.');
	expect(en.errorTasksFailed(3)).toBe('3 files could not be synced.');
});
