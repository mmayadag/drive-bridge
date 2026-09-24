// The radio-row strategy picker: renders one row per choice, keeps exactly one radio and
// click handler per row even when Obsidian reuses the row on a re-render, and marks the
// selected one. Backed by the jsdom environment installed globally in
// test/support/setup.ts, since this code manipulates real DOM nodes (querySelectorAll,
// prepend, a WeakMap keyed by the row element).

import type { Setting, SettingDefinition } from 'obsidian';
import { expect, test } from 'bun:test';
import { byOrder, choiceRows } from '@/settings/strategy';

function fakeSetting() {
	const settingEl = document.createElement('div');
	const descEl = document.createElement('div');
	return { descEl, settingEl } as never as { descEl: HTMLElement; settingEl: HTMLElement };
}

function render(row: SettingDefinition | undefined, setting: unknown) {
	return row?.render?.(setting as Setting, undefined as never);
}

function click(el: Element) {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function keydown(el: Element, key: string) {
	el.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key }));
}

test('byOrder sorts by order, undefined last among equals at 100', () => {
	const items = [{ order: 5 }, { order: undefined }, { order: 1 }];
	expect(items.toSorted(byOrder).map((i) => i.order)).toStrictEqual([1, 5, undefined]);
});

test('choices render sorted by order', () => {
	const rows = choiceRows(
		[
			{ key: 'b', name: 'B', order: 2 },
			{ key: 'a', name: 'A', order: 1 },
		],
		() => 'a',
		() => {},
	);
	expect(rows.map((r) => r.name)).toStrictEqual(['A', 'B']);
});

test('rendering adds the row class and a radio, marked for the selected choice', () => {
	let selected = 'a';
	const rows = choiceRows(
		[
			{ key: 'a', name: 'A' },
			{ key: 'b', name: 'B' },
		],
		() => selected,
		(key) => void (selected = key),
	);
	const settingA = fakeSetting();
	render(rows[0], settingA);
	const settingB = fakeSetting();
	render(rows[1], settingB);

	expect(settingA.settingEl.classList.contains('drive-bridge-choice')).toBe(true);
	const radioA = settingA.settingEl.querySelector('.drive-bridge-radio');
	const radioB = settingB.settingEl.querySelector('.drive-bridge-radio');
	expect(radioA?.getAttribute('role')).toBe('radio');
	expect(radioA?.classList.contains('is-checked')).toBe(true);
	expect(radioA?.getAttribute('aria-checked')).toBe('true');
	expect(radioB?.classList.contains('is-checked')).toBe(false);
});

test('clicking the row selects it and re-marks every rendered row', () => {
	let selected = 'a';
	const rows = choiceRows(
		[
			{ key: 'a', name: 'A' },
			{ key: 'b', name: 'B' },
		],
		() => selected,
		(key) => void (selected = key),
	);
	const settingA = fakeSetting();
	render(rows[0], settingA);
	const settingB = fakeSetting();
	render(rows[1], settingB);

	click(settingB.settingEl);
	expect(selected).toBe('b');
	expect(
		settingA.settingEl.querySelector('.drive-bridge-radio')?.classList.contains('is-checked'),
	).toBe(false);
	expect(
		settingB.settingEl.querySelector('.drive-bridge-radio')?.classList.contains('is-checked'),
	).toBe(true);
});

test('Enter and Space on the radio also select it, other keys do not', () => {
	let selected = '';
	const rows = choiceRows(
		[{ key: 'a', name: 'A' }],
		() => selected,
		(key) => void (selected = key),
	);
	const setting = fakeSetting();
	render(rows[0], setting);
	const radio = setting.settingEl.querySelector('.drive-bridge-radio') as HTMLElement;

	keydown(radio, 'Tab');
	expect(selected).toBe('');
	keydown(radio, 'Enter');
	expect(selected).toBe('a');
	selected = '';
	keydown(radio, ' ');
	expect(selected).toBe('a');
});

test('a flow choice draws the vault/drive arrow diagram in the description', () => {
	const rows = choiceRows(
		[{ flow: 'both', key: 'a', name: 'A' }],
		() => '',
		() => {},
	);
	const setting = fakeSetting();
	render(rows[0], setting);

	const svg = setting.descEl.querySelector('svg.drive-bridge-flow');
	expect(svg).not.toBeNull();
	expect(svg?.querySelectorAll('path.drive-bridge-flow-arrow path, path')).toBeDefined();
	// A both-direction flow draws two arrowheads.
	expect(svg?.querySelector('.drive-bridge-flow-arrow')?.getAttribute('d')).toContain(
		'M46 14h32',
	);
});

test('toLocal and toRemote flows draw only one arrowhead each', () => {
	const toLocal = fakeSetting();
	render(
		choiceRows(
			[{ flow: 'toLocal', key: 'a', name: 'A' }],
			() => '',
			() => {},
		)[0],
		toLocal,
	);
	const toRemote = fakeSetting();
	render(
		choiceRows(
			[{ flow: 'toRemote', key: 'a', name: 'A' }],
			() => '',
			() => {},
		)[0],
		toRemote,
	);

	const arrowLocal = toLocal.descEl.querySelector('.drive-bridge-flow-arrow')?.getAttribute('d');
	const arrowRemote = toRemote.descEl
		.querySelector('.drive-bridge-flow-arrow')
		?.getAttribute('d');
	expect(arrowLocal).toContain('M52 8l-6 6 6 6');
	expect(arrowLocal).not.toContain('M72 8l6 6-6 6');
	expect(arrowRemote).toContain('M72 8l6 6-6 6');
	expect(arrowRemote).not.toContain('M52 8l-6 6 6 6');
});

test('an example choice draws its example text in the description', () => {
	const rows = choiceRows(
		[{ example: 'e.g. renames the older file', key: 'a', name: 'A' }],
		() => '',
		() => {},
	);
	const setting = fakeSetting();
	render(rows[0], setting);

	expect(setting.descEl.querySelector('.drive-bridge-choice-example')?.textContent).toBe(
		'e.g. renames the older file',
	);
});

test('re-rendering the same reused row replaces the radio and click handler once', () => {
	let selectCalls = 0;
	const rows = choiceRows(
		[{ key: 'a', name: 'A' }],
		() => '',
		() => void selectCalls++,
	);
	const setting = fakeSetting();

	render(rows[0], setting);
	render(rows[0], setting); // Obsidian re-renders the same settingEl in place.

	expect(setting.settingEl.querySelectorAll('.drive-bridge-radio')).toHaveLength(1);
	click(setting.settingEl);
	expect(selectCalls).toBe(1);
});

test('the cleanup function removes the click handler and the radio', () => {
	let selectCalls = 0;
	const rows = choiceRows(
		[{ key: 'a', name: 'A' }],
		() => '',
		() => void selectCalls++,
	);
	const setting = fakeSetting();
	const cleanup = render(rows[0], setting);

	cleanup?.();
	expect(setting.settingEl.querySelector('.drive-bridge-radio')).toBeNull();
	click(setting.settingEl);
	expect(selectCalls).toBe(0);
});
