import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';

void mock.module('obsidian', () => ObsidianMock);

const { default: webhooksSettings, parseWebhookUrl } = await import('@/settings/webhooks');

test('an empty field turns the webhook off', () => {
	expect(parseWebhookUrl('')).toBe('');
	expect(parseWebhookUrl('   ')).toBe('');
});

test('accepts an https URL and trims it', () => {
	expect(parseWebhookUrl('  https://hooks.example.com/abc  ')).toBe(
		'https://hooks.example.com/abc',
	);
});

test('rejects plain http and half-typed addresses without throwing', () => {
	// The settings field calls this on every keystroke, so it must never throw.
	expect(parseWebhookUrl('http://hooks.example.com/abc')).toBeUndefined();
	expect(parseWebhookUrl('h')).toBeUndefined();
	expect(parseWebhookUrl('https:/')).toBeUndefined();
	expect(parseWebhookUrl('ftp://example.com')).toBeUndefined();
	// oxlint-disable-next-line eslint/no-script-url -- the point is that it is rejected
	expect(parseWebhookUrl('javascript:alert(1)')).toBeUndefined();
});

type Group = Record<number, () => { render: (setting: never) => void }>;

function fakeText(initial: string) {
	const blurHandlers: Array<() => void> = [];
	let onChangeHandler: ((value: string) => void) | undefined;
	let value = initial;
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
		blurHandlers,
		text,
		type: (next: string) => {
			value = next;
			onChangeHandler?.(next);
		},
	};
}

function webhookGroup(settings: { webhookOnStart: string; webhookOnFinish: string }) {
	const saved: Array<true> = [];
	const tree = webhooksSettings({
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: settings as never,
		translate: ((key: string) => key) as never,
	}) as never as { [MORE]: { [PAGE.advanced]: { [ADVANCED.webhooks]: Group } } };
	return { group: tree[MORE][PAGE.advanced][ADVANCED.webhooks], saved };
}

test('an invalid webhook URL is not saved until it becomes valid', () => {
	const settings = { webhookOnFinish: '', webhookOnStart: 'https://old.example.com' };
	const { group, saved } = webhookGroup(settings);
	const harness = fakeText('https://old.example.com');
	group[1000]().render({
		addText: (cb: (t: typeof harness.text) => void) => cb(harness.text),
	} as never);

	harness.type('http://insecure.example.com');
	harness.blurHandlers[0]?.();
	expect(settings.webhookOnStart).toBe('https://old.example.com');
	expect(saved).toStrictEqual([]);

	harness.type('https://new.example.com');
	harness.blurHandlers[0]?.();
	expect(settings.webhookOnStart).toBe('https://new.example.com');
	expect(saved).toStrictEqual([true]);
});

test('clearing the field turns the webhook off and saves', () => {
	const settings = { webhookOnFinish: 'https://finish.example.com', webhookOnStart: '' };
	const { group, saved } = webhookGroup(settings);
	const harness = fakeText('https://finish.example.com');
	group[2000]().render({
		addText: (cb: (t: typeof harness.text) => void) => cb(harness.text),
	} as never);

	harness.type('   ');
	harness.blurHandlers[0]?.();
	expect(settings.webhookOnFinish).toBe('');
	expect(saved).toStrictEqual([true]);
});
