import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

// A mutable stand-in for Obsidian's Platform: individual tests flip its flags to exercise
// platformName()'s other branches, since the module binds to this same object by reference.
const platform: Record<string, boolean> = { isMacOS: true };

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: NoticeSpy,
	Platform: platform,
	apiVersion: '1.13.7',
}));

const {
	coffeeQuestion,
	copyProblemReport,
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

test('copyProblemReport writes the report to the clipboard and notifies', async () => {
	const written: Array<string> = [];
	const originalClipboard = navigator.clipboard as unknown;
	Object.assign(navigator, { clipboard: { writeText: (text: string) => written.push(text) } });
	notices.length = 0;
	try {
		await copyProblemReport({
			getLogs: () => 'log line',
			settings: { remoteFs: 'gdrive' },
			translate: ((key: string) => key) as never,
		});
		expect(written).toHaveLength(1);
		expect(written[0]).toContain('## Environment');
		expect(written[0]).toContain('log line');
		expect(notices).toStrictEqual([{ message: 'problemReportCopied', timeout: 8000 }]);
	} finally {
		Object.assign(navigator, { clipboard: originalClipboard });
	}
});

function helpItem() {
	const tree = supportSettings({
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

test('the help row wires up the guide, bug, feature and copy-report buttons', async () => {
	const buttons: Array<ReturnType<typeof fakeExtraButton>> = [];
	const setting = {
		addExtraButton: (cb: (b: ReturnType<typeof fakeExtraButton>) => void) => {
			const button = fakeExtraButton();
			buttons.push(button);
			cb(button);
			return setting;
		},
	};
	helpItem().render(setting);

	expect(buttons).toHaveLength(4);
	expect(buttons.map((b) => b.calls.setIcon[0])).toStrictEqual([
		'book-open',
		'bug',
		'lightbulb',
		'clipboard-copy',
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

	const written: Array<string> = [];
	const originalClipboard = navigator.clipboard as unknown;
	Object.assign(navigator, { clipboard: { writeText: (text: string) => written.push(text) } });
	try {
		buttons[3]?.trigger();
		await Promise.resolve();
		await Promise.resolve();
		expect(written).toHaveLength(1);
	} finally {
		Object.assign(navigator, { clipboard: originalClipboard });
	}
});

let onSyncTerminated: (() => void) | undefined;

test('the coffee row draws the question, the button and the plugin version', () => {
	const settings: { lastSync?: { at: number; result: string } } = { lastSync: undefined };
	const tree = supportSettings({
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
