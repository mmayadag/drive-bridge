// Settings-tree building blocks: the number/time/file-size field paired with an enable
// toggle, and the editable-list add/delete actions. Backed by the jsdom environment
// installed globally in test/support/setup.ts.

import { expect, test } from 'bun:test';
import { generateEditableList, renderTogglableValue } from '@/settings/utils';
import { openMemoryDB } from '@/shared/key-value-store';

function fakeText(initial = '') {
	let value = initial;
	let onChangeHandler: ((value: string) => void) | undefined;
	const blurHandlers: Array<() => void> = [];
	const text = {
		getValue: () => value,
		inputEl: {
			addClass: () => {},
			addEventListener: (event: string, fn: () => void) => {
				if (event === 'blur') blurHandlers.push(fn);
			},
			focus: () => {},
			removeClass: () => {},
		},
		onChange: (fn: (value: string) => void) => {
			onChangeHandler = fn;
			return text;
		},
		setPlaceholder: () => text,
		setValue: (next: string) => {
			value = next;
			return text;
		},
	};
	return {
		blur: () => blurHandlers.forEach((fn) => fn()),
		text,
		type: (next: string) => {
			value = next;
			onChangeHandler?.(next);
		},
	};
}

function fakeToggle(initial: boolean) {
	let onChangeHandler: ((value: boolean) => void) | undefined;
	let value = initial;
	const toggle = {
		change: (v: boolean) => onChangeHandler?.(v),
		onChange: (fn: (value: boolean) => void) => {
			onChangeHandler = fn;
			return toggle;
		},
		setValue: (v: boolean) => {
			value = v;
			return toggle;
		},
		value: () => value,
	};
	return toggle;
}

function fakeTogglableSetting() {
	const textHarness = fakeText();
	const toggleHarness = fakeToggle(false);
	const setting = {
		addText: (cb: (t: typeof textHarness.text) => void) => {
			cb(textHarness.text);
			return setting;
		},
		addToggle: (cb: (t: typeof toggleHarness) => void) => {
			cb(toggleHarness);
			return setting;
		},
		setClass: () => setting,
	};
	return { setting, textHarness, toggleHarness };
}

test('a number field parses, rejects negatives, and saves on blur', () => {
	const saved: Array<true> = [];
	const changed: Array<number> = [];
	const field = { enabled: true, value: 5 };
	const render = renderTogglableValue({
		field,
		onChange: (value) => changed.push(value),
		placeholder: 'placeholder',
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		type: 'number',
	});
	const { setting, textHarness } = fakeTogglableSetting();
	render(setting as never);

	expect(textHarness.text.getValue()).toBe('5');
	textHarness.type('-1');
	textHarness.blur();
	expect(field.value).toBe(5);
	expect(saved).toStrictEqual([]);

	textHarness.type('12');
	textHarness.blur();
	expect(field.value).toBe(12);
	expect(changed).toStrictEqual([12]);
	expect(saved).toStrictEqual([true]);
});

test('rejectZero refuses zero but a plain number field accepts it', () => {
	const field = { enabled: true, value: 1 };
	const render = renderTogglableValue({
		field,
		placeholder: '',
		rejectZero: true,
		saveSettings: () => Promise.resolve(),
		type: 'number',
	});
	const { setting, textHarness } = fakeTogglableSetting();
	render(setting as never);

	textHarness.type('0');
	textHarness.blur();
	expect(field.value).toBe(1);
});

test('a time field formats and parses durations', () => {
	const field = { enabled: false, value: 90 };
	const render = renderTogglableValue({
		field,
		placeholder: '',
		saveSettings: () => Promise.resolve(),
		type: 'time',
	});
	const { setting, textHarness } = fakeTogglableSetting();
	render(setting as never);

	expect(textHarness.text.getValue()).not.toBe('90');
	textHarness.type('2min');
	textHarness.blur();
	expect(field.value).toBe(120_000);
});

test('a file-size field formats and parses sizes', () => {
	const field = { enabled: false, value: 2048 };
	const render = renderTogglableValue({
		field,
		placeholder: '',
		saveSettings: () => Promise.resolve(),
		type: 'fileSize',
	});
	const { setting, textHarness } = fakeTogglableSetting();
	render(setting as never);

	expect(textHarness.text.getValue()).not.toBe('2048');
	textHarness.type('1KB');
	textHarness.blur();
	expect(field.value).toBe(1024);
});

test('the toggle flips and saves only on a real change', () => {
	const saved: Array<true> = [];
	const toggled: Array<boolean> = [];
	const field = { enabled: false, value: 1 };
	const render = renderTogglableValue({
		field,
		onToggle: (value) => toggled.push(value),
		placeholder: '',
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		type: 'number',
	});
	const { setting, toggleHarness } = fakeTogglableSetting();
	render(setting as never);

	expect(toggleHarness.value()).toBe(false);
	toggleHarness.change(false);
	expect(saved).toStrictEqual([]);

	toggleHarness.change(true);
	expect(field.enabled).toBe(true);
	expect(toggled).toStrictEqual([true]);
	expect(saved).toStrictEqual([true]);
});

test('an editable list adds a fresh item and deletes an existing one', () => {
	const memoryDB = openMemoryDB(`utils-test-${Math.random()}`);
	const items = [{ value: 'a' }, { value: 'b' }];
	const rerendered: Array<true> = [];
	const saved: Array<true> = [];
	const list = generateEditableList({
		defaultValue: { value: '' },
		identifier: 'things',
		items,
		memoryDB: memoryDB as never,
		render: () => {},
		rerenderSettingTab: () => void rerendered.push(true),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		translations: { add: 'Add', empty: 'Empty' },
	});

	expect(list.items).toHaveLength(2);
	list.addItem?.action(document.createElement('button'));
	expect(rerendered).toStrictEqual([true]);
	expect(memoryDB.getStore('ephemeralEditableLists').get('things')).toHaveLength(3);

	list.onDelete?.(0);
	expect(items).toStrictEqual([{ value: 'b' }]);
	expect(saved).toStrictEqual([true]);
	expect(rerendered).toStrictEqual([true, true]);
});

test('an unknown field type neither formats nor accepts a value', () => {
	// The type union makes this unreachable from typed code; the switches fall through
	// and leave the field untouched rather than throwing.
	const field = { enabled: true, value: 7 };
	const render = renderTogglableValue({
		field,
		placeholder: '',
		saveSettings: () => Promise.resolve(),
		type: 'bogus' as never,
	});
	const { setting, textHarness } = fakeTogglableSetting();
	render(setting as never);

	expect(textHarness.text.getValue()).toBeUndefined();
	textHarness.type('12');
	textHarness.blur();
	expect(field.value).toBe(7);
});
