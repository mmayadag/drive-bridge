// The Google Drive account settings: sign-in, pasting/exchanging a token, the client
// ID/secret fields, disconnect, base directory and the folder picker, and the trash
// toggle. The declarative shape (visible/status/displayValue) is covered in
// test/gdrive/setting.test.ts; this covers what each row's `render` actually does, backed
// by the jsdom environment installed globally in test/support/setup.ts.

import type {
	Setting,
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionPage,
} from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam } from '@/modules/registrar';
import { openMemoryDB } from '@/shared/key-value-store';

function render(row: SettingDefinition | undefined, setting: unknown) {
	return row?.render?.(setting as Setting, undefined as never);
}

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

type HttpResponse = { json?: unknown; status?: number };
let responses: Array<HttpResponse> = [];
const httpRequests: Array<RequestParam> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: NoticeSpy,
	requestUrl: (params: RequestParam) => {
		httpRequests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		return Promise.resolve({ json: response.json, status: response.status ?? 200 });
	},
}));

function resetHttp(...next: Array<HttpResponse>) {
	httpRequests.length = 0;
	responses = [...next];
}

type FolderPickerOptions = { onChoose: (path: string) => void };
const folderPickers: Array<{ opened: boolean; options: FolderPickerOptions }> = [];
class FolderPickerModalSpy {
	entry: { opened: boolean; options: FolderPickerOptions };
	constructor(_app: unknown, options: FolderPickerOptions) {
		this.entry = { opened: false, options };
		folderPickers.push(this.entry);
	}
	open() {
		this.entry.opened = true;
	}
}
void mock.module('@/gdrive/folder-picker', () => ({ default: FolderPickerModalSpy }));

const { TokenManager } = await import('@/gdrive/auth');
const { default: gdriveSetting } = await import('@/gdrive/setting');

const SECRET_ID = 'drive-bridge-gdrive-client-secret';
const REFRESH_ID = 'drive-bridge-gdrive-refresh-token';
const FULL_DRIVE = 'https://www.googleapis.com/auth/drive';

// Real crypto (PKCE's code challenge) and jsdom take actual wall-clock time, not a fixed
// number of microtask ticks.
async function waitUntil(check: () => boolean, timeoutMs = 2000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error('waitUntil timed out');
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
	}
}

function setup({
	baseDirectory = '',
	clientId = '',
	email = '',
	secret = '',
	token = '',
	useTrash = false,
}: {
	baseDirectory?: string;
	clientId?: string;
	email?: string;
	secret?: string;
	token?: string;
	useTrash?: boolean;
} = {}) {
	const secrets = new Map<string, string>();
	if (secret) secrets.set(SECRET_ID, secret);
	if (token) secrets.set(REFRESH_ID, token);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const moduleSettings = { accountEmail: email, baseDirectory, clientId, useTrash };
	const tokenManager = new TokenManager(storage as never, () => moduleSettings.clientId);
	const saved: Array<true> = [];
	const rerendered: Array<true> = [];
	const refreshed: Array<true> = [];
	const dispatched: Array<{ event: string; message: string }> = [];
	const opened: Array<true> = [];
	const ctx = {
		app: {} as never,
		dispatch: ((event: string, message: string) =>
			void dispatched.push({ event, message })) as never,
		getCheckConnection: (() => () => Promise.resolve({ success: true as const })) as never,
		getRequest: () => (() => Promise.resolve({})) as never,
		matchLabel: () => ({ text: 'match', tooltip: 'match' }),
		memoryDB: openMemoryDB<Record<string, unknown>, { lastCheckedFs: string }>(
			`gdrive-setting-test-${Math.random()}`,
		),
		openImportSettings: () => void opened.push(true),
		refreshSettingTab: () => void refreshed.push(true),
		rerenderSettingTab: () => void rerendered.push(true),
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		settings: { remoteFs: 'gdrive' } as never,
		translate: ((key: string, arg?: unknown) =>
			arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) as never,
	};
	const tree = gdriveSetting(ctx, moduleSettings as never, tokenManager) as never as Record<
		number,
		(self: unknown) => SettingDefinitionGroup
	>;
	const group = tree[551](tree[551]);
	const page = group.items?.[0] as SettingDefinitionPage & {
		items: Array<SettingDefinition>;
	};
	// Rows of sub-pages (the Setup page) count too.
	const flatten = (items: Array<SettingDefinition>): Array<SettingDefinition> =>
		items.flatMap((item) => [
			item,
			...flatten(((item as SettingDefinitionPage).items ?? []) as Array<SettingDefinition>),
		]);
	const allRows = flatten(group.items ?? []);
	const rowByName = (name: string) => allRows.find((item) => item.name === name);
	return {
		dispatched,
		moduleSettings,
		opened,
		page,
		refreshed,
		rerendered,
		rowByName,
		saved,
		secrets,
		tokenManager,
	};
}

// A duck-typed `Setting` whose add*() calls run the callback with a matching duck component
// and, like the real Setting, return itself so calls chain.
function fakeSetting() {
	const buttons: Array<ReturnType<typeof fakeButton>> = [];
	const extraButtons: Array<ReturnType<typeof fakeExtraButton>> = [];
	const texts: Array<ReturnType<typeof fakeText>> = [];
	let toggle: ReturnType<typeof fakeToggle> | undefined;
	const setting = {
		addButton: (cb: (b: ReturnType<typeof fakeButton>) => void) => {
			const button = fakeButton();
			buttons.push(button);
			cb(button);
			return setting;
		},
		addExtraButton: (cb: (b: ReturnType<typeof fakeExtraButton>) => void) => {
			const button = fakeExtraButton();
			extraButtons.push(button);
			cb(button);
			return setting;
		},
		addText: (cb: (t: ReturnType<typeof fakeText>['text']) => void) => {
			const harness = fakeText();
			texts.push(harness);
			cb(harness.text);
			return setting;
		},
		addToggle: (cb: (t: ReturnType<typeof fakeToggle>) => void) => {
			toggle = fakeToggle();
			cb(toggle);
			return setting;
		},
		buttons,
		descEl: document.createElement('div'),
		extraButtons,
		nameEl: document.createElement('div'),
		settingEl: document.createElement('div'),
		texts,
		toggle: () => toggle,
	};
	return setting;
}

function fakeButton() {
	let onClickHandler: (() => void) | undefined;
	const button = {
		calls: { setDestructive: 0 },
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setButtonText: () => button,
		setCta: () => button,
		setDestructive: () => {
			button.calls.setDestructive += 1;
			return button;
		},
		trigger: () => onClickHandler?.(),
	};
	return button;
}

function fakeExtraButton() {
	let onClickHandler: (() => void) | undefined;
	const button = {
		extraSettingsEl: {
			firstElementChild: undefined as
				| { addClasses: () => void; removeClasses: () => void }
				| undefined,
		},
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

function fakeText(initial = '') {
	let value = initial;
	let onChangeHandler: ((value: string) => void) | undefined;
	const blurHandlers: Array<() => void> = [];
	const classes = new Set<string>();
	const text = {
		getValue: () => value,
		inputEl: {
			addClass: (name: string) => void classes.add(name),
			addEventListener: (event: string, fn: () => void) => {
				if (event === 'blur') blurHandlers.push(fn);
			},
			classes,
			focus: () => {},
			removeClass: (name: string) => void classes.delete(name),
			toggleClass: (name: string, on: boolean) =>
				void (on ? classes.add(name) : classes.delete(name)),
			type: '',
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

function fakeToggle() {
	let onChangeHandler: ((value: boolean) => void) | undefined;
	let value = false;
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

test('the import-from-device button opens the import flow', () => {
	const { opened, rowByName } = setup();
	const setting = fakeSetting();
	render(rowByName('setUpFromDevice'), setting);
	setting.buttons[0]?.trigger();
	expect(opened).toStrictEqual([true]);
});

test('a Cloud Console step button opens the right URL', () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	try {
		const setting = fakeSetting();
		render(rowByName('1. stepProject'), setting);
		setting.buttons[0]?.trigger();
		expect(opened).toStrictEqual(['https://console.cloud.google.com/projectcreate']);
	} finally {
		window.open = originalOpen;
	}
});

test('the client ID field fills from a pasted client_secret.json and flags a bad value', () => {
	const { moduleSettings, saved, rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const setting = fakeSetting();
	render(rowByName('clientId'), setting);

	setting.texts[0]?.type(
		JSON.stringify({
			installed: {
				client_id: '1-abc.apps.googleusercontent.com',
				client_secret: 'new-secret',
			},
		}),
	);
	expect(moduleSettings.clientId).toBe('1-abc.apps.googleusercontent.com');
	expect(saved).toStrictEqual([true]);
	expect(notices.some((n) => n.message === 'clientFromJson')).toBe(true);
});

test('the client ID field trims and saves on blur, but only when it changed', () => {
	const { moduleSettings, saved, rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const setting = fakeSetting();
	render(rowByName('clientId'), setting);
	setting.texts[0]?.type('  client-typo  ');

	setting.texts[0]?.blur();
	expect(moduleSettings.clientId).toBe('client-typo');
	expect(saved).toStrictEqual([true]);

	setting.texts[0]?.blur();
	expect(saved).toStrictEqual([true]);
});

test('the client secret field sets a password input and saves on blur', () => {
	const { secrets, rowByName } = setup({ clientId: 'client' });
	const setting = fakeSetting();
	render(rowByName('clientSecret'), setting);

	expect(setting.texts[0]?.text.inputEl.type).toBe('password');
	setting.texts[0]?.type('  new-secret  ');
	setting.texts[0]?.blur();
	expect(secrets.get(SECRET_ID)).toBe('new-secret');
});

test('sign-in demands the client fields before opening Google', async () => {
	const { rowByName } = setup();
	const setting = fakeSetting();
	render(rowByName('signInWithGoogle'), setting);

	notices.length = 0;
	setting.buttons[0]?.trigger();
	await Promise.resolve();
	expect(notices[0]?.message).toBe('enterClientId');
});

test('sign-in opens the Google consent URL once the client fields are filled', async () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const idSetting = fakeSetting();
	render(rowByName('clientId'), idSetting);
	idSetting.texts[0]?.type('client');
	const secretSetting = fakeSetting();
	render(rowByName('clientSecret'), secretSetting);
	secretSetting.texts[0]?.type('secret');
	const signInSetting = fakeSetting();
	render(rowByName('signInWithGoogle'), signInSetting);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	notices.length = 0;
	try {
		signInSetting.buttons[0]?.trigger();
		await waitUntil(() => opened.length > 0);
	} finally {
		window.open = originalOpen;
	}
	expect(String(opened[0])).toContain('accounts.google.com');
	expect(notices.some((n) => n.message === 'signInOpened')).toBe(true);
});

test('connect demands whichever field is still empty', async () => {
	const { rowByName } = setup();
	const setting = fakeSetting();
	render(rowByName('connectAccount'), setting);

	notices.length = 0;
	setting.buttons[0]?.trigger();
	await Promise.resolve();
	expect(notices[0]?.message).toBe('enterClientId');
});

test('connect pastes a plain refresh token straight through connectWithToken', async () => {
	resetHttp(
		{ json: { access_token: 'access', expires_in: 3600, scope: FULL_DRIVE } },
		{ json: { user: { emailAddress: 'me@test', permissionId: 'perm-1' } } },
	);
	const { moduleSettings, refreshed, rerendered, rowByName, saved } = setup({
		clientId: 'client',
		secret: 'secret',
	});
	const setting = fakeSetting();
	render(rowByName('connectAccount'), setting);
	setting.texts[0]?.type('1//new-token');

	notices.length = 0;
	setting.buttons[0]?.trigger();
	await waitUntil(() => saved.length > 0);

	expect(moduleSettings.accountEmail).toBe('me@test');
	expect(refreshed).toStrictEqual([true]);
	expect(rerendered).toStrictEqual([true]);
	expect(notices.some((n) => n.message === 'connectSuccess')).toBe(true);
});

test('connect reports a bad token distinctly', async () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const setting = fakeSetting();
	render(rowByName('connectAccount'), setting);
	setting.texts[0]?.type('not a token');

	notices.length = 0;
	setting.buttons[0]?.trigger();
	await Promise.resolve();
	expect(notices[0]?.message).toBe('invalidRefreshToken');
});

test('a redirect that carries no matching pending sign-in asks to start over', async () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const setting = fakeSetting();
	render(rowByName('connectAccount'), setting);
	setting.texts[0]?.type('http://127.0.0.1:53682?code=abc&state=whatever');

	notices.length = 0;
	setting.buttons[0]?.trigger();
	await Promise.resolve();
	expect(notices[0]?.message).toBe('signInStartAgain');
});

test('a full sign-in-then-paste round trip exchanges the code for a refresh token', async () => {
	const { moduleSettings, rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const idSetting = fakeSetting();
	render(rowByName('clientId'), idSetting);
	idSetting.texts[0]?.type('client');
	const secretSetting = fakeSetting();
	render(rowByName('clientSecret'), secretSetting);
	secretSetting.texts[0]?.type('secret');
	const signInSetting = fakeSetting();
	render(rowByName('signInWithGoogle'), signInSetting);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	let state = '';
	try {
		signInSetting.buttons[0]?.trigger();
		await waitUntil(() => opened.length > 0);
		state = new URL(String(opened[0])).searchParams.get('state') ?? '';
	} finally {
		window.open = originalOpen;
	}
	expect(state).not.toBe('');

	resetHttp(
		{ json: { refresh_token: '1//exchanged' } },
		{ json: { access_token: 'access', expires_in: 3600, scope: FULL_DRIVE } },
		{ json: { user: { emailAddress: 'me@test', permissionId: 'perm-1' } } },
	);
	const connectSetting = fakeSetting();
	render(rowByName('connectAccount'), connectSetting);
	connectSetting.texts[0]?.type(`http://127.0.0.1:53682?code=the-code&state=${state}`);
	connectSetting.buttons[0]?.trigger();
	await waitUntil(() => moduleSettings.accountEmail !== '');

	expect(moduleSettings.accountEmail).toBe('me@test');
});

test('a denied consent asks to start over', async () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const idSetting = fakeSetting();
	render(rowByName('clientId'), idSetting);
	idSetting.texts[0]?.type('client');
	const secretSetting = fakeSetting();
	render(rowByName('clientSecret'), secretSetting);
	secretSetting.texts[0]?.type('secret');
	const signInSetting = fakeSetting();
	render(rowByName('signInWithGoogle'), signInSetting);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	let state = '';
	try {
		signInSetting.buttons[0]?.trigger();
		await waitUntil(() => opened.length > 0);
		state = new URL(String(opened[0])).searchParams.get('state') ?? '';
	} finally {
		window.open = originalOpen;
	}

	const connectSetting = fakeSetting();
	render(rowByName('connectAccount'), connectSetting);
	connectSetting.texts[0]?.type(`http://127.0.0.1:53682?error=access_denied&state=${state}`);
	notices.length = 0;
	connectSetting.buttons[0]?.trigger();
	await Promise.resolve();
	expect(notices[0]?.message).toBe('signInDenied');
});

async function signInAndGetState(rowByName: ReturnType<typeof setup>['rowByName']) {
	const idSetting = fakeSetting();
	render(rowByName('clientId'), idSetting);
	idSetting.texts[0]?.type('client');
	const secretSetting = fakeSetting();
	render(rowByName('clientSecret'), secretSetting);
	secretSetting.texts[0]?.type('secret');
	const signInSetting = fakeSetting();
	render(rowByName('signInWithGoogle'), signInSetting);

	const opened: Array<string | URL> = [];
	const originalOpen = window.open;
	window.open = ((url: string | URL) => void opened.push(url)) as never;
	try {
		signInSetting.buttons[0]?.trigger();
		await waitUntil(() => opened.length > 0);
		return new URL(String(opened[0])).searchParams.get('state') ?? '';
	} finally {
		window.open = originalOpen;
	}
}

test('a failed code exchange notifies and logs, without connecting', async () => {
	const { dispatched, rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const state = await signInAndGetState(rowByName);

	resetHttp({ json: { error: 'invalid_grant' }, status: 400 });
	const connectSetting = fakeSetting();
	render(rowByName('connectAccount'), connectSetting);
	connectSetting.texts[0]?.type(`http://127.0.0.1:53682?code=bad-code&state=${state}`);
	notices.length = 0;
	connectSetting.buttons[0]?.trigger();
	await waitUntil(() => notices.length > 0);

	expect(notices[0]?.message).toBe('authorizationFailed:"invalid_grant"');
	expect(dispatched).toHaveLength(1);
	expect(dispatched[0]?.event).toBe('errorGeneral');
});

test('connecting with typed-but-unsaved client fields reports configureFirst', async () => {
	// findMissingInput reads the live field text (passes validation), but tokenManager's
	// stored credentials are untouched since the fields were never blurred.
	const { rowByName } = setup();
	const idSetting = fakeSetting();
	render(rowByName('clientId'), idSetting);
	idSetting.texts[0]?.type('client');
	const secretSetting = fakeSetting();
	render(rowByName('clientSecret'), secretSetting);
	secretSetting.texts[0]?.type('secret');

	const connectSetting = fakeSetting();
	render(rowByName('connectAccount'), connectSetting);
	connectSetting.texts[0]?.type('1//some-token');

	notices.length = 0;
	connectSetting.buttons[0]?.trigger();
	await waitUntil(() => notices.length > 0);
	expect(notices[0]?.message).toBe('configureFirst');
});

test('a generic connection failure reports the reason', async () => {
	resetHttp({ json: { error: 'server_error' }, status: 500 });
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const connectSetting = fakeSetting();
	render(rowByName('connectAccount'), connectSetting);
	connectSetting.texts[0]?.type('1//some-token');

	notices.length = 0;
	connectSetting.buttons[0]?.trigger();
	await waitUntil(() => notices.length > 0);
	expect(notices[0]?.message).toContain('authorizationFailed');
});

test('the setup-tip row adds its class', () => {
	const { rowByName } = setup({ clientId: 'client', secret: 'secret' });
	const settingEl = document.createElement('div');
	render(rowByName('dummy'), { settingEl });
	expect(settingEl.classList.contains('drive-bridge-setting-tip')).toBe(true);
});

test('disconnect forgets the token on this device and resets the module', () => {
	const { moduleSettings, refreshed, rowByName, secrets } = setup({
		clientId: 'client',
		email: 'me@test',
		secret: 'secret',
		token: '1//token',
	});
	const setting = fakeSetting();
	render(rowByName('accountConnected'), setting);

	setting.buttons[0]?.trigger();
	expect(moduleSettings.accountEmail).toBe('');
	expect(secrets.has(REFRESH_ID)).toBe(false);
	expect(refreshed).toStrictEqual([true]);
});

test('base directory normalizes and saves on blur', () => {
	const { moduleSettings, rowByName, saved } = setup();
	const setting = fakeSetting();
	render(rowByName('baseDirectory'), setting);

	setting.texts[0]?.type('  notes//sub  ');
	setting.texts[0]?.blur();
	expect(moduleSettings.baseDirectory).not.toBe('');
	expect(saved).toStrictEqual([true]);
});

test('the folder picker warns when nothing is connected, otherwise opens and applies the choice', () => {
	const disconnected = setup();
	const disconnectedSetting = fakeSetting();
	render(disconnected.rowByName('baseDirectory'), disconnectedSetting);

	notices.length = 0;
	disconnectedSetting.extraButtons[0]?.trigger();
	expect(notices[0]?.message).toBe('connectFirst');
	expect(folderPickers).toHaveLength(0);

	const connected = setup({ clientId: 'client', secret: 'secret', token: '1//token' });
	const connectedSetting = fakeSetting();
	render(connected.rowByName('baseDirectory'), connectedSetting);

	connectedSetting.extraButtons[0]?.trigger();
	expect(folderPickers).toHaveLength(1);
	expect(folderPickers[0]?.opened).toBe(true);

	folderPickers[0]?.options.onChoose('picked/sub');
	expect(connected.moduleSettings.baseDirectory).not.toBe('');
});

test('the trash toggle updates and saves', () => {
	const { moduleSettings, rowByName, saved } = setup();
	const setting = fakeSetting();
	render(rowByName('useTrash'), setting);

	expect(setting.toggle()?.value()).toBe(false);
	setting.toggle()?.change(true);
	expect(moduleSettings.useTrash).toBe(true);
	expect(saved).toStrictEqual([true]);
});

test('connected without a client ID, the field is outlined and says why it matters', () => {
	const { rowByName } = setup({ secret: 'secret', token: '1//token' });
	expect(rowByName('clientId')?.desc).toBe('clientIdNeeded');
	const setting = fakeSetting();
	render(rowByName('clientId'), setting);
	expect(setting.texts[0]?.text.inputEl.classes.has('drive-bridge-invalid-input')).toBe(true);

	const other = setup({ clientId: '123-abc.apps.googleusercontent.com', secret: 'secret' });
	expect(other.rowByName('clientId')?.desc).toBe('clientIdDescription');
	const plain = fakeSetting();
	render(other.rowByName('clientId'), plain);
	expect(plain.texts[0]?.text.inputEl.classes.has('drive-bridge-invalid-input')).toBe(false);
});
