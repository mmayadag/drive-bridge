import { ModalSpy, SettingSpy } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

// A mutable stand-in for Obsidian's Platform: individual tests flip its flags to exercise
// platformName()'s other branches, since the module binds to this same object by reference.
const platform: Record<string, boolean> = { isMacOS: true };

// Every window the tests open, with what it shows.
const windows: Array<ModalSpy> = [];
class WindowSpy extends ModalSpy {
	open() {
		windows.push(this);
		super.open();
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: WindowSpy,
	Notice: NoticeSpy,
	Platform: platform,
	Setting: SettingSpy,
	apiVersion: '1.13.7',
}));

const {
	coffeeQuestion,
	showProblemReport,
	default: supportSettings,
	reportUrl,
} = await import('@/settings/support');

test('the report links open the matching issue form with the versions filled in', () => {
	for (const kind of ['bug', 'request'] as const) {
		const url = new URL(reportUrl(kind));
		expect(url.origin + url.pathname).toBe(
			'https://github.com/mmayadag/drive-bridge/issues/new',
		);
		expect(url.searchParams.get('template')).toBe(`${kind}.yml`);
		expect(url.searchParams.get('obsidian')).toBe('1.13.7');
		expect(url.searchParams.get('platform')).toBe('macOS');
		expect(url.searchParams.get('plugin')).toBeTruthy();
		// The report says nothing about the vault or its owner.
		expect(url.href.toLowerCase()).not.toContain('vault');
		expect(url.href.toLowerCase()).not.toContain('token');
	}
});

test('the form field names in the link exist in both issue forms', async () => {
	const url = new URL(reportUrl('bug'));
	const fields = [...url.searchParams.keys()].filter((key) => key !== 'template');
	for (const form of ['bug', 'request']) {
		const yaml = await Bun.file(`.github/ISSUE_TEMPLATE/${form}.yml`).text();
		for (const field of fields) expect(yaml).toContain(`id: ${field}\n`);
	}
});

test('the coffee line follows the last sync', () => {
	expect(coffeeQuestion()).toBe('coffeeSetUp');
	expect(coffeeQuestion({ at: 1, result: 'completed' })).toBe('coffeeWorks');
	expect(coffeeQuestion({ at: 1, result: 'noop' })).toBe('coffeeWorks');
	expect(coffeeQuestion({ at: 1, error: 'offline', result: 'failed' })).toBe('coffeeFailed');
	expect(coffeeQuestion({ at: 1, result: 'cancelled' })).toBe('coffeeQuestion');
});

test('reportUrl names every platform branch', () => {
	const cases: Array<[Record<string, boolean>, string]> = [
		[{ isIosApp: true }, 'iOS'],
		[{ isAndroidApp: true }, 'Android'],
		[{ isMacOS: true }, 'macOS'],
		[{ isWin: true }, 'Windows'],
		[{ isLinux: true }, 'Linux'],
		[{}, 'unknown'],
	];
	for (const key of Object.keys(platform)) delete platform[key];
	try {
		for (const [flags, expected] of cases) {
			for (const key of Object.keys(platform)) delete platform[key];
			Object.assign(platform, flags);
			expect(new URL(reportUrl()).searchParams.get('platform')).toBe(expected);
		}
	} finally {
		for (const key of Object.keys(platform)) delete platform[key];
		platform.isMacOS = true;
	}
});

test('the problem report opens in a window to select, without touching the clipboard', () => {
	windows.length = 0;
	notices.length = 0;
	showProblemReport({
		app: {} as never,
		getLogs: () => 'log line',
		settings: { remoteFs: 'gdrive' },
		translate: ((key: string) => key) as never,
	});
	expect(windows).toHaveLength(1);
	expect(windows[0]?.title).toBe('problemReport');
	const area = windows[0]?.contentEl.querySelector('textarea');
	expect(area?.value).toContain('## Environment');
	expect(area?.value).toContain('log line');
	expect(windows[0]?.contentEl.textContent).toContain('problemReportHint');
	expect(notices).toStrictEqual([]);
});

function helpRow() {
	const buttons: Array<ReturnType<typeof fakeExtraButton>> = [];
	const setting = {
		addExtraButton: (cb: (b: ReturnType<typeof fakeExtraButton>) => void) => {
			const button = fakeExtraButton();
			buttons.push(button);
			cb(button);
			return setting;
		},
		infoEl: document.createElement('div'),
	};
	return { buttons, setting };
}

function helpItem() {
	const tree = supportSettings({
		app: {} as never,
		getLogs: () => '',
		on: () => () => {},
		settings: {},
		translate: ((key: string) => key) as never,
	});
	type Group = Record<number, () => { render: (setting: unknown) => void }>;
	return (tree[8000] as unknown as Group)[1000]();
}

function fakeExtraButton() {
	const calls: { setIcon: Array<string>; setTooltip: Array<string> } = {
		setIcon: [],
		setTooltip: [],
	};
	let onClickHandler: (() => void) | undefined;
	const button = {
		calls,
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setIcon: (icon: string) => {
			calls.setIcon.push(icon);
			return button;
		},
		setTooltip: (tooltip: string) => {
			calls.setTooltip.push(tooltip);
			return button;
		},
		trigger: () => onClickHandler?.(),
	};
	return button;
}

test('the help row wires up the guide, bug, feature and problem report buttons', () => {
	const { buttons, setting } = helpRow();
	helpItem().render(setting);

	expect(buttons).toHaveLength(4);
	expect(buttons.map((b) => b.calls.setIcon[0])).toStrictEqual([
		'book-open',
		'bug',
		'lightbulb',
		'file-text',
	]);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => {
		opened.push(url);
	}) as never;
	try {
		buttons[0]?.trigger();
		buttons[1]?.trigger();
		buttons[2]?.trigger();
		expect(opened).toHaveLength(3);
		expect(opened[0]).toBe('https://github.com/mmayadag/drive-bridge#readme');
		expect(new URL(opened[1] as string).searchParams.get('template')).toBe('bug.yml');
		expect(new URL(opened[2] as string).searchParams.get('template')).toBe('request.yml');
	} finally {
		window.open = originalOpen;
	}

	windows.length = 0;
	buttons[3]?.trigger();
	expect(windows).toHaveLength(1);
});

let onSyncTerminated: (() => void) | undefined;

test('the coffee row draws the question, the button and the plugin version', () => {
	const settings: { lastSync?: { at: number; result: string } } = { lastSync: undefined };
	const tree = supportSettings({
		app: {} as never,
		getLogs: () => '',
		on: ((_event: string, fn: () => void) => {
			onSyncTerminated = fn;
			return () => {};
		}) as never,
		settings: settings as never,
		translate: ((key: string, arg?: string) =>
			arg === undefined ? key : `${key}:${arg}`) as never,
	});
	type Group = Record<number, () => { render: (setting: unknown) => void }>;
	const item = (tree[9000] as unknown as Group)[1000]();

	const settingEl = document.createElement('div');
	const controlEl = document.createElement('div');
	const cleanup = item.render({ controlEl, settingEl });

	expect(settingEl.classList.contains('drive-bridge-coffee')).toBe(true);
	const question = controlEl.querySelector('.drive-bridge-coffee-question');
	expect(question?.textContent).toBe('coffeeSetUp');

	const link = controlEl.querySelector('a.drive-bridge-coffee-button');
	expect(link?.getAttribute('href')).toBe('https://buymeacoffee.com/muratmayadag');
	expect(link?.getAttribute('rel')).toBe('noopener');
	expect(link?.querySelector('svg.drive-bridge-coffee-cup')).not.toBeNull();
	expect(link?.textContent).toContain('buyMeACoffee');

	const version = controlEl.querySelector('.drive-bridge-coffee-version');
	expect(version?.textContent).toContain('pluginVersion:');

	// A sync redraws only the question, following the outcome.
	settings.lastSync = { at: 1, result: 'completed' };
	onSyncTerminated?.();
	expect(controlEl.querySelector('.drive-bridge-coffee-question')?.textContent).toBe(
		'coffeeWorks',
	);

	expect(typeof cleanup).toBe('function');
});

test('the help title opens the same items as a labelled list, each doing what its icon does', () => {
	const { setting } = helpRow();
	helpItem().render(setting);
	windows.length = 0;
	setting.infoEl.click();
	expect(windows).toHaveLength(1);
	const list = windows[0];
	expect(list.title).toBe('helpAndSupport');
	const rows = [...list.contentEl.querySelectorAll<HTMLElement>('.drive-bridge-help-item')];
	expect(rows).toHaveLength(4);
	expect(rows.every((row) => row.querySelector('.drive-bridge-help-icon'))).toBe(true);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	try {
		rows[0]?.click();
		expect(list.closed).toBe(true);
		expect(opened).toStrictEqual(['https://github.com/mmayadag/drive-bridge#readme']);
		const { KeyboardEvent: Key } = rows[1].ownerDocument
			.defaultView as unknown as typeof globalThis;
		rows[1]?.dispatchEvent(new Key('keydown', { key: 'Enter' }));
		expect(new URL(String(opened[1])).searchParams.get('template')).toBe('bug.yml');
		rows[2]?.dispatchEvent(new Key('keydown', { key: 'a' }));
		expect(opened).toHaveLength(2);
	} finally {
		window.open = originalOpen;
	}
	// The last row opens the problem report window.
	windows.length = 0;
	rows[3]?.click();
	expect(windows[0]?.title).toBe('problemReport');

	// The keyboard reaches the list too.
	windows.length = 0;
	const { KeyboardEvent: Key } = setting.infoEl.ownerDocument
		.defaultView as unknown as typeof globalThis;
	setting.infoEl.dispatchEvent(new Key('keydown', { key: ' ' }));
	setting.infoEl.dispatchEvent(new Key('keydown', { key: 'x' }));
	expect(windows).toHaveLength(1);
});
