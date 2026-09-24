// The full-scan-vs-changes-only dropdown for how the Drive side is listed each sync.

import { expect, test } from 'bun:test';
import remoteScanSetting from '@/gdrive/remote-scan-setting';

function fakeDropdown() {
	const options: Array<[string, string]> = [];
	let onChangeHandler: ((value: string) => void) | undefined;
	let value = '';
	const dropdown = {
		addOption: (key: string, label: string) => {
			options.push([key, label]);
			return dropdown;
		},
		onChange: (fn: (value: string) => void) => {
			onChangeHandler = fn;
			return dropdown;
		},
		setValue: (v: string) => {
			value = v;
			return dropdown;
		},
	};
	return { dropdown, options, select: (v: string) => onChangeHandler?.(v), value: () => value };
}

function render(
	settings: { remoteScan: 'full' | 'changes' },
	saveSettings = () => Promise.resolve(),
) {
	const item = remoteScanSetting(
		((key: string) => key) as never,
		settings,
		saveSettings,
	) as never as () => { render: (setting: unknown) => void };
	const harness = fakeDropdown();
	item().render({
		addDropdown: (cb: (d: typeof harness.dropdown) => void) => cb(harness.dropdown),
	});
	return harness;
}

test('offers both scan modes and shows the current one', () => {
	const harness = render({ remoteScan: 'changes' });
	expect(harness.options).toStrictEqual([
		['full', 'remoteScanFull'],
		['changes', 'remoteScanChanges'],
	]);
	expect(harness.value()).toBe('changes');
});

test('picking "changes" switches the setting and saves', () => {
	const settings: { remoteScan: 'full' | 'changes' } = { remoteScan: 'full' };
	const saved: Array<true> = [];
	const harness = render(settings, () => {
		saved.push(true);
		return Promise.resolve();
	});

	harness.select('changes');
	expect(settings.remoteScan).toBe('changes');
	expect(saved).toStrictEqual([true]);
});

test('anything other than "changes" falls back to "full"', () => {
	const settings: { remoteScan: 'full' | 'changes' } = { remoteScan: 'changes' };
	const harness = render(settings);

	harness.select('unexpected-value');
	expect(settings.remoteScan).toBe('full');
});
