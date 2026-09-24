// The inclusion/exclusion rule lists: validating and normalizing each glob, and toggling
// case sensitivity. Uses the real generateEditableList/reactivelyValidate, backed by the
// jsdom environment installed globally in test/support/setup.ts; `setting`/`text`/`button`
// are duck-typed to just what filter.ts touches.

import { expect, test } from 'bun:test';
import { PAGE, MORE } from '@/settings/layout';
import { openMemoryDB } from '@/shared/key-value-store';

const { default: filterSettings } = await import('@/settings/filter');

type Rule = { caseSensitive: boolean; expr: string };
type EditableList = { items: Array<{ render: (setting: unknown) => void }> };
type Group = Record<number, () => { render?: (setting: never) => void } | Group | EditableList>;

function baseCtx(overrides: Record<string, unknown> = {}) {
	return {
		memoryDB: openMemoryDB(`filter-test-${Math.random()}`),
		rerenderSettingTab: () => {},
		saveSettings: () => Promise.resolve(),
		settings: {
			exclusionRules: [] as Array<Rule>,
			inclusionRules: [{ caseSensitive: false, expr: 'notes/**' }] as Array<Rule>,
		},
		translate: ((key: string, arg?: number) =>
			arg === undefined ? key : `${key}:${arg}`) as never,
		...overrides,
	};
}

function ruleList(ctx: ReturnType<typeof baseCtx>, page: 1000 | 2000): EditableList {
	const tree = filterSettings(ctx as never) as never as {
		[MORE]: { [PAGE.filters]: Group };
	};
	const group = tree[MORE][PAGE.filters];
	const pageNode = group[page] as never as Group;
	return pageNode[1000]() as EditableList;
}

function fakeText() {
	const blurHandlers: Array<() => void> = [];
	let onChangeHandler: ((value: string) => void) | undefined;
	let focused = false;
	let value = '';
	const text = {
		getValue: () => value,
		inputEl: {
			addClass: () => {},
			addEventListener: (event: string, fn: () => void) => {
				if (event === 'blur') blurHandlers.push(fn);
			},
			focus: () => void (focused = true),
			removeClass: () => {},
		},
		onChange: (fn: (value: string) => void) => {
			onChangeHandler = fn;
			return text;
		},
		setPlaceholder: () => text,
		// The real setValue is called by the component's own code (initial display, and
		// after a successful save); it must not be confused with the user typing.
		setValue: (next: string) => {
			value = next;
			return text;
		},
	};
	return {
		blurHandlers,
		focused: () => focused,
		text,
		// Simulates a keystroke: updates the field and runs the live-validation callback.
		type: (next: string) => {
			value = next;
			onChangeHandler?.(next);
		},
	};
}

function fakeButton() {
	const classes = new Set<string>();
	let onClickHandler: (() => void) | undefined;
	const button = {
		extraSettingsEl: {
			addClasses: (list: Array<string>) => list.forEach((c) => classes.add(c)),
			removeClasses: (list: Array<string>) => list.forEach((c) => classes.delete(c)),
		},
		hasActiveClass: () => classes.has('drive-bridge-toggle-active'),
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setIcon: () => button,
		setTooltip: () => button,
		trigger: () => onClickHandler?.(),
	};
	return button;
}

function fakeSetting(
	text: ReturnType<typeof fakeText>['text'],
	button: ReturnType<typeof fakeButton>,
) {
	const setting = {
		addExtraButton: (cb: (b: typeof button) => void) => {
			cb(button);
			return setting;
		},
		addText: (cb: (t: typeof text) => void) => {
			cb(text);
			return setting;
		},
		settingEl: { addClass: () => {}, querySelector: () => {} },
	};
	return setting;
}

test('an existing rule renders its expression and case-sensitivity toggle', () => {
	const ctx = baseCtx();
	const list = ruleList(ctx, 1000);
	expect(list.items).toHaveLength(1);

	const { text } = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(text, button));
	expect(button.hasActiveClass()).toBe(false);
});

test('clearing the expression invalidates the rule and drops it right away', () => {
	const ctx = baseCtx();
	const list = ruleList(ctx, 1000);
	const harness = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(harness.text, button));

	// The invalid branch saves eagerly, on every keystroke — not just on blur.
	harness.type('');
	expect(ctx.settings.inclusionRules).toHaveLength(0);
});

test('a valid expression is trimmed and normalized on blur', () => {
	const ctx = baseCtx();
	const list = ruleList(ctx, 1000);
	const harness = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(harness.text, button));

	harness.type('  /Notes//  ');
	// A valid edit is not saved until blur.
	expect(ctx.settings.inclusionRules[0]?.expr).toBe('  /Notes//  ');
	harness.blurHandlers[0]?.();
	expect(ctx.settings.inclusionRules[0]?.expr).toBe('/Notes/');
});

test('toggling case sensitivity flips the class and saves', () => {
	const ctx = baseCtx();
	const list = ruleList(ctx, 1000);
	const harness = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(harness.text, button));

	button.trigger();
	expect(button.hasActiveClass()).toBe(true);
	expect(ctx.settings.inclusionRules[0]?.caseSensitive).toBe(true);

	button.trigger();
	expect(button.hasActiveClass()).toBe(false);
	expect(ctx.settings.inclusionRules[0]?.caseSensitive).toBe(false);
});

test('a brand new rule focuses its field once', () => {
	const ctx = baseCtx();
	ctx.memoryDB
		.getStore('ephemeralEditableLists')
		.set('inclusionRules', [
			{ new: true, valid: false, value: { caseSensitive: false, expr: '' } },
		]);
	const list = ruleList(ctx, 1000);
	const harness = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(harness.text, button));

	expect(harness.focused()).toBe(true);
});

test('the exclusion page reads and writes settings.exclusionRules independently', () => {
	const ctx = baseCtx({
		settings: {
			exclusionRules: [{ caseSensitive: false, expr: '.git' }],
			inclusionRules: [],
		},
	});
	const list = ruleList(ctx, 2000);
	expect(list.items).toHaveLength(1);

	const harness = fakeText();
	const button = fakeButton();
	list.items[0]?.render(fakeSetting(harness.text, button));
	harness.type('.trash');
	harness.blurHandlers[0]?.();

	expect(ctx.settings.exclusionRules[0]?.expr).toBe('.trash');
	expect(ctx.settings.inclusionRules).toHaveLength(0);
});

test('the inclusion and exclusion pages report how many rules are configured', () => {
	const ctx = baseCtx();
	const tree = filterSettings(ctx as never) as never as {
		[MORE]: { [PAGE.filters]: Group };
	};
	const group = tree[MORE][PAGE.filters];
	const inclusionFn = group[1000] as never as (self: unknown) => { displayValue: () => string };
	const exclusionFn = group[2000] as never as (self: unknown) => { displayValue: () => string };
	const inclusionPage = inclusionFn(inclusionFn);
	const exclusionPage = exclusionFn(exclusionFn);

	expect(inclusionPage.displayValue()).toBe('xConfigured:1');
	expect(exclusionPage.displayValue()).toBe('xConfigured:0');
});
