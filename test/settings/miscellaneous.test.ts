// The custom-headers editable list: validating the header key (rejecting Google Drive's
// own reserved headers), adding a secret-valued header, and editing a plaintext value.
// Uses the real generateEditableList/reactivelyValidate, backed by the jsdom environment
// installed globally in test/support/setup.ts; `setting`/`text`/`button` are duck-typed to
// just what miscellaneous.ts touches.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';
import { openMemoryDB } from '@/shared/key-value-store';

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

type SecretCall = { value?: string; onChange?: (value: string | undefined) => void };
const secretComponents: Array<SecretCall> = [];
class SecretComponentSpy {
	call: SecretCall = {};
	constructor() {
		secretComponents.push(this.call);
	}
	setValue(value: string) {
		this.call.value = value;
		return this;
	}
	onChange(fn: (value: string | undefined) => void) {
		this.call.onChange = fn;
		return this;
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: NoticeSpy,
	SecretComponent: SecretComponentSpy,
}));

const { default: miscellaneousSettings } = await import('@/settings/miscellaneous');

type EditableList = {
	addItem: { action: () => void; name: string };
	extraButtons?: Array<(button: unknown, list: Array<unknown>) => void>;
	items: Array<{ render: (setting: unknown) => void }>;
};
type Group = Record<number, () => { render?: (setting: never) => void } | Group | EditableList>;

type CustomHeader = { key: string; type: 'plaintext' | 'secret'; value: string };

function baseCtx(overrides: Record<string, unknown> = {}) {
	return {
		app: {} as never,
		memoryDB: openMemoryDB(`miscellaneous-test-${Math.random()}`),
		rerenderSettingTab: () => {},
		saveSettings: () => Promise.resolve(),
		settings: { customHeaders: [{ key: 'X-Foo', type: 'plaintext', value: 'bar' }] } as {
			customHeaders: Array<CustomHeader>;
		},
		translate: ((key: string, arg?: number) =>
			arg === undefined ? key : `${key}:${arg}`) as never,
		...overrides,
	};
}

function editableList(ctx: ReturnType<typeof baseCtx>): EditableList {
	const tree = miscellaneousSettings(ctx as never) as never as {
		[MORE]: { [PAGE.advanced]: { [ADVANCED.miscellaneous]: Group } };
	};
	const group = tree[MORE][PAGE.advanced][ADVANCED.miscellaneous];
	const page = group[1000] as never as Group;
	return page[1000]() as EditableList;
}

function fakeSetting() {
	const calls: { addComponent: number; addText: number } = { addComponent: 0, addText: 0 };
	const texts: Array<{
		getValue: () => string;
		inputEl: {
			addClass: () => void;
			addEventListener: (event: string, fn: () => void) => void;
			focus: () => void;
			removeClass: () => void;
		};
		onChange: (fn: (value: string) => void) => unknown;
		setPlaceholder: (v: string) => unknown;
		setValue: (v: string) => unknown;
	}> = [];
	const blurHandlers: Array<() => void> = [];
	let focused = false;
	const setting = {
		addComponent: (cb: (element: unknown) => void) => {
			calls.addComponent += 1;
			cb({});
			return setting;
		},
		addText: (cb: (t: (typeof texts)[number]) => void) => {
			calls.addText += 1;
			const value = calls.addText === 1 ? 'X-Foo' : 'bar';
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
				onChange: () => text,
				setPlaceholder: () => text,
				setValue: () => text,
			};
			texts.push(text);
			cb(text);
			return setting;
		},
		settingEl: { addClass: () => {}, querySelector: () => {} },
	};
	return { blurHandlers, calls, focused: () => focused, setting };
}

test('the header row renders the key and value fields', () => {
	const list = editableList(baseCtx());
	expect(list.items).toHaveLength(1);

	const harness = fakeSetting();
	list.items[0]?.render(harness.setting);
	expect(harness.calls.addText).toBe(2);
	expect(harness.focused()).toBe(false);
});

test('a brand new row focuses its key field once', () => {
	const ctx = baseCtx();
	ctx.memoryDB
		.getStore('ephemeralEditableLists')
		.set('customHeaders', [
			{ new: true, valid: false, value: { key: '', type: 'plaintext', value: '' } },
		]);
	const list = editableList(ctx);
	const harness = fakeSetting();
	list.items[0]?.render(harness.setting);

	expect(harness.focused()).toBe(true);
});

test('editing the header value trims and saves it on blur', () => {
	const ctx = baseCtx();
	const list = editableList(ctx);
	const harness = fakeSetting();
	list.items[0]?.render(harness.setting);

	harness.blurHandlers[1]?.();
	expect(ctx.settings.customHeaders[0]?.value).toBe('bar');
});

test('clearing the header key marks the row invalid', () => {
	const ctx = baseCtx();
	const list = editableList(ctx);
	const harness = fakeSetting();
	harness.setting.addText = ((cb: (t: unknown) => void) => {
		const text = {
			getValue: () => '   ',
			inputEl: {
				addClass: () => {},
				addEventListener: () => {},
				focus: () => {},
				removeClass: () => {},
			},
			onChange: () => text,
			setPlaceholder: () => text,
			setValue: () => text,
		};
		cb(text);
		return harness.setting;
	}) as never;
	list.items[0]?.render(harness.setting);

	// An invalid row is dropped by generateEditableList's own save filter.
	expect(ctx.settings.customHeaders).toHaveLength(0);
});

test('a reserved header key is rejected with a Notice', () => {
	notices.length = 0;
	const ctx = baseCtx();
	const list = editableList(ctx);
	const harness = fakeSetting();
	harness.setting.addText = ((cb: (t: unknown) => void) => {
		const text = {
			getValue: () => 'Authorization',
			inputEl: {
				addClass: () => {},
				addEventListener: () => {},
				focus: () => {},
				removeClass: () => {},
			},
			onChange: () => text,
			setPlaceholder: () => text,
			setValue: () => text,
		};
		cb(text);
		return harness.setting;
	}) as never;
	list.items[0]?.render(harness.setting);

	expect(notices).toStrictEqual([{ message: 'reservedHeader', timeout: 5000 }]);
});

test('a secret-type header renders a SecretComponent instead of a plaintext field', () => {
	secretComponents.length = 0;
	const ctx = baseCtx({
		settings: { customHeaders: [{ key: 'X-Token', type: 'secret', value: 'shh' }] },
	});
	const list = editableList(ctx);
	const harness = fakeSetting();
	list.items[0]?.render(harness.setting);

	expect(harness.calls.addComponent).toBe(1);
	expect(secretComponents).toHaveLength(1);
	expect(secretComponents[0]?.value).toBe('shh');

	secretComponents[0]?.onChange?.('new-secret');
	expect(ctx.settings.customHeaders[0]?.value).toBe('new-secret');
});

test('the add-secret-header extra button pushes a new secret-type item and rerenders', () => {
	const rerendered: Array<true> = [];
	const ctx = baseCtx({ rerenderSettingTab: () => void rerendered.push(true) });
	const list = editableList(ctx);
	let onClickHandler: (() => void) | undefined;
	const button = {
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setIcon: () => button,
		setTooltip: () => button,
	};
	// generateEditableList curries its own ephemeral list into the extra button; the effect
	// shows up back in the memory store it was seeded from.
	list.extraButtons?.[0]?.(button, []);
	onClickHandler?.();

	const stored = ctx.memoryDB.getStore('ephemeralEditableLists').get('customHeaders') as
		| Array<unknown>
		| undefined;
	expect(stored).toHaveLength(2);
	expect(stored?.at(-1)).toMatchObject({ new: true, valid: false, value: { type: 'secret' } });
	expect(rerendered).toStrictEqual([true]);
});

test('the custom-headers page reports how many are configured', () => {
	const ctx = baseCtx();
	const tree = miscellaneousSettings(ctx as never) as never as {
		[MORE]: { [PAGE.advanced]: { [ADVANCED.miscellaneous]: Group } };
	};
	const group = tree[MORE][PAGE.advanced][ADVANCED.miscellaneous];
	const pageFn = group[1000] as never as (self: unknown) => { displayValue: () => string };
	expect(pageFn(pageFn).displayValue()).toBe('xConfigured:1');
});

test('editing the header key to a new valid value saves it on blur', () => {
	// Regression: the custom addText override below previously had a no-op
	// addEventListener, so the blur handler was never captured and onSave never ran —
	// the test passed for the wrong reason (the immediate validation's own early save on
	// the *invalid* path), not because a valid key actually saved on blur.
	const ctx = baseCtx();
	const list = editableList(ctx);
	const harness = fakeSetting();
	const blurHandlers: Array<() => void> = [];
	harness.setting.addText = ((cb: (t: unknown) => void) => {
		const text = {
			getValue: () => 'X-New-Name',
			inputEl: {
				addClass: () => {},
				addEventListener: (event: string, fn: () => void) => {
					if (event === 'blur') blurHandlers.push(fn);
				},
				focus: () => {},
				removeClass: () => {},
			},
			onChange: () => text,
			setPlaceholder: () => text,
			setValue: () => text,
		};
		cb(text);
		return harness.setting;
	}) as never;
	list.items[0]?.render(harness.setting);

	expect(blurHandlers).not.toHaveLength(0);
	blurHandlers.forEach((fn) => fn());
	expect(ctx.settings.customHeaders[0]?.key).toBe('X-New-Name');
});
