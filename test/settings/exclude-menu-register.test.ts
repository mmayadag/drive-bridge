// The file-menu wiring for "Exclude from sync" / "Include in sync", including the undo
// link on the resulting Notice. No real DOM is available in this test environment, so
// `menu`/`item`/the fragment builder are duck-typed to just what exclude-menu.ts touches.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { TFolder } from 'obsidian';

const notices: Array<{ fragment: FakeFragment; timeout?: number }> = [];
class NoticeSpy {
	hidden = false;
	constructor(
		public fragment: FakeFragment,
		public timeout?: number,
	) {
		notices.push({ fragment, timeout });
	}
	hide() {
		this.hidden = true;
	}
}

void mock.module('obsidian', () => ({ ...ObsidianMock, Notice: NoticeSpy }));

const { registerExcludeMenu } = await import('@/settings/exclude-menu');

type FakeFragment = {
	links: Array<{ click: (event: { preventDefault: () => void }) => void }>;
	text: string;
};

function fakeFragment(): FakeFragment {
	const fragment: FakeFragment = { links: [], text: '' };
	return fragment;
}

function installFragmentBuilder() {
	const original = globalThis.createFragment;
	globalThis.createFragment = ((build?: (frag: unknown) => void) => {
		const fragment = fakeFragment();
		const builderFrag = {
			appendText: (text: string) => void (fragment.text += text),
			createEl: (_tag: string, options: { href?: string; text?: string }) => {
				const link = {
					addEventListener: (
						_event: string,
						handler: (event: { preventDefault: () => void }) => void,
					) => void fragment.links.push({ click: handler }),
				};
				fragment.text += options.text ?? '';
				return link;
			},
		};
		build?.(builderFrag);
		return fragment as never;
	}) as typeof globalThis.createFragment;
	return () => {
		globalThis.createFragment = original;
	};
}

function fakeMenuItem() {
	const calls: { setIcon: Array<string>; setTitle: Array<string> } = {
		setIcon: [],
		setTitle: [],
	};
	let onClickHandler: (() => void) | undefined;
	const item = {
		calls,
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return item;
		},
		setIcon: (icon: string) => {
			calls.setIcon.push(icon);
			return item;
		},
		setTitle: (title: string) => {
			calls.setTitle.push(title);
			return item;
		},
		trigger: () => onClickHandler?.(),
	};
	return item;
}

function setup(exclusionRules: Array<{ caseSensitive: boolean; expr: string }> = []) {
	let fileMenuHandler: ((menu: unknown, file: unknown) => void) | undefined;
	const cleared: Array<true> = [];
	const rerendered: Array<true> = [];
	const saved: Array<true> = [];
	const settings = { exclusionRules };
	registerExcludeMenu({
		app: {
			workspace: {
				on: (event: string, handler: (menu: unknown, file: unknown) => void) => {
					if (event === 'file-menu') fileMenuHandler = handler;
					return {};
				},
			},
		} as never,
		memoryDB: { getStore: () => ({ clear: () => void cleared.push(true) }) },
		registerEvent: () => {},
		rerenderSettingTab: () => void rerendered.push(true),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: settings as never,
		translate: ((key: string) => key) as never,
	});
	return { cleared, fileMenuHandler: () => fileMenuHandler, rerendered, saved, settings };
}

test('the root path gets no menu item', () => {
	const { fileMenuHandler } = setup();
	const item = fakeMenuItem();
	const menu = { addItem: (cb: (i: typeof item) => void) => cb(item) };
	fileMenuHandler()?.(menu, { path: '/' });
	fileMenuHandler()?.(menu, { path: '' });
	expect(item.calls.setTitle).toStrictEqual([]);
});

test('a file not yet excluded offers to exclude it, anchored and file-scoped', () => {
	const { fileMenuHandler } = setup();
	const item = fakeMenuItem();
	const menu = { addItem: (cb: (i: typeof item) => void) => cb(item) };
	fileMenuHandler()?.(menu, { path: 'notes/a.md' });

	expect(item.calls.setTitle).toStrictEqual(['excludeFromSync']);
	expect(item.calls.setIcon).toStrictEqual(['cloud-off']);
});

test('a folder already excluded offers to include it back, and updates settings on click', () => {
	const restore = installFragmentBuilder();
	try {
		const { fileMenuHandler, saved, settings } = setup([
			{ caseSensitive: true, expr: '/Archive/' },
		]);
		const item = fakeMenuItem();
		const menu = { addItem: (cb: (i: typeof item) => void) => cb(item) };
		const folder = Object.assign(new TFolder(), { path: 'Archive' });
		fileMenuHandler()?.(menu, folder);

		expect(item.calls.setTitle).toStrictEqual(['includeInSync']);
		expect(item.calls.setIcon).toStrictEqual(['cloud']);

		item.trigger();
		expect(settings.exclusionRules).toStrictEqual([]);
		expect(saved).toStrictEqual([true]);
	} finally {
		restore();
	}
});

test('clicking the item excludes the file, clears the list cache and shows an undo notice', () => {
	const restore = installFragmentBuilder();
	notices.length = 0;
	try {
		const { cleared, fileMenuHandler, rerendered, settings } = setup();
		const item = fakeMenuItem();
		const menu = { addItem: (cb: (i: typeof item) => void) => cb(item) };
		fileMenuHandler()?.(menu, { path: 'notes/a.md' });

		item.trigger();
		expect(settings.exclusionRules).toStrictEqual([
			{ caseSensitive: true, expr: '/notes/a.md' },
		]);
		expect(cleared).toStrictEqual([true]);
		expect(rerendered).toStrictEqual([true]);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.timeout).toBe(8000);
		expect(notices[0]?.fragment.text).toContain('excludedFromSync notes/a.md');

		notices[0]?.fragment.links[0]?.click({ preventDefault: () => {} });
		expect(settings.exclusionRules).toStrictEqual([]);
	} finally {
		restore();
	}
});
