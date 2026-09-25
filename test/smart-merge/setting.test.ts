// The Smart merge marker settings: a page under the Conflicts section, shown only while
// Smart merge is the chosen strategy, with a start and end field per marker pair.

import { expect, test } from 'bun:test';
import type { SettingTree } from '@/modules/setting';
import type { SmartMergeSettings } from '@/smart-merge/setting';
import { CONFLICTS } from '@/settings/layout';
import smartMergeSetting from '@/smart-merge/setting';

type Definition = {
	desc?: string;
	items?: Array<Definition>;
	name: string;
	render?: (setting: unknown) => void;
	type?: string;
	visible?: () => boolean;
};

function fakeText() {
	const text = {
		getValue: () => text.inputEl.value,
		inputEl: createEl('input'),
		placeholder: '',
		setPlaceholder: (value: string) => {
			text.placeholder = value;
			return text;
		},
		setValue: (value: string) => {
			text.inputEl.value = value;
			return text;
		},
	};
	return text;
}

function fakeSetting() {
	const texts: Array<ReturnType<typeof fakeText>> = [];
	const classes: Array<string> = [];
	const setting = {
		addText: (build: (text: ReturnType<typeof fakeText>) => void) => {
			const text = fakeText();
			texts.push(text);
			build(text);
			return setting;
		},
		setClass: (cls: string) => {
			classes.push(cls);
			return setting;
		},
	};
	return { classes, setting, texts };
}

// jsdom only dispatches events made by its own window.
function blur(el: HTMLInputElement) {
	const view = el.ownerDocument.defaultView as unknown as { FocusEvent: typeof FocusEvent };
	el.dispatchEvent(new view.FocusEvent('blur'));
}

function markers(): SmartMergeSettings {
	return {
		conflictAEnd: 'A>',
		conflictAStart: '<A',
		conflictBEnd: 'B>',
		conflictBStart: '<B',
		deletionEnd: 'D>',
		deletionStart: '<D',
	};
}

function page(options: { selected?: boolean } = {}) {
	const settings = markers();
	let saves = 0;
	const tree = smartMergeSetting(
		{
			isSelected: () => options.selected ?? true,
			saveSettings: () => Promise.resolve(void saves++),
			translate: ((key: string) => key) as never,
		},
		settings,
	) as unknown as Record<number, Record<number, SettingTree>>;
	const node = tree[CONFLICTS][1000];
	const definition = node(node) as unknown as Definition;
	return { definition, saves: () => saves, settings };
}

test('the markers page sits under Conflicts and shows only while Smart merge is selected', () => {
	const { definition } = page();
	expect(definition.name).toBe('mergeMarkers');
	expect(definition.type).toBe('page');
	expect(definition.visible?.()).toBe(true);
	expect(page({ selected: false }).definition.visible?.()).toBe(false);
});

test('the page lists ours, theirs and deletion markers', () => {
	const { definition } = page();
	expect(definition.items?.map((item) => [item.name, item.desc])).toEqual([
		['conflictOursMarkers', 'conflictOursMarkersDescription'],
		['conflictTheirsMarkers', 'conflictTheirsMarkersDescription'],
		['deletionMarkers', 'deletionMarkersDescription'],
	]);
});

test('each row shows its start and end markers and saves an edit on blur', () => {
	const { definition, saves, settings } = page();
	const keys: Array<[keyof SmartMergeSettings, keyof SmartMergeSettings]> = [
		['conflictAStart', 'conflictAEnd'],
		['conflictBStart', 'conflictBEnd'],
		['deletionStart', 'deletionEnd'],
	];
	for (const [index, item] of (definition.items ?? []).entries()) {
		const { classes, setting, texts } = fakeSetting();
		item.render?.(setting);
		expect(classes).toEqual(['drive-bridge-togglable-value', 'drive-bridge-marker-setting']);
		const [startKey, endKey] = keys[index];
		expect(texts.map((text) => [text.inputEl.value, text.placeholder])).toEqual([
			[settings[startKey], 'start'],
			[settings[endKey], 'end'],
		]);

		texts[0].inputEl.value = `new-${startKey}`;
		blur(texts[0].inputEl);
		texts[1].inputEl.value = `new-${endKey}`;
		blur(texts[1].inputEl);
		expect(settings[startKey]).toBe(`new-${startKey}`);
		expect(settings[endKey]).toBe(`new-${endKey}`);
	}
	expect(saves()).toBe(6);
});
