import { expect, test } from 'bun:test';
import controlsSettings from '@/settings/controls';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';
import { ref } from '@/shared/reactive';

type Row = () => { name: string; render: (setting: unknown) => void };

function previewRow() {
	const runs: Array<[string, unknown]> = [];
	const isIdle = ref(true);
	const tree = controlsSettings({
		executeSync: (trigger, options) => {
			runs.push([trigger, options]);
			return Promise.resolve({ result: 'noop' });
		},
		isIdle,
		saveSettings: () => Promise.resolve(),
		settings: {} as never,
		speedLabel: () => ({ text: 'speed', tooltip: '' }),
		translate: ((key: string) => key) as never,
	}) as unknown as Record<number, Record<number, Record<number, Record<number, Row>>>>;
	const row = tree[MORE][PAGE.advanced][ADVANCED.controls][100]();
	let click = () => {};
	const button = {
		onClick: (fn: () => void) => {
			click = fn;
			return button;
		},
		setButtonText: () => button,
	};
	row.render({ addButton: (cb: (b: typeof button) => void) => cb(button) });
	return { click: () => click(), isIdle, row, runs };
}

test('Preview sync under Controls plans a sync without running it, and waits while one runs', () => {
	const { click, isIdle, row, runs } = previewRow();
	expect(row.name).toBe('previewSync');
	isIdle(false);
	click();
	expect(runs).toStrictEqual([]);
	isIdle(true);
	click();
	expect(runs).toStrictEqual([['preview', { preview: true }]]);
});
