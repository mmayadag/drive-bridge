// The Drive folder picker modal: lists subfolders, lets you drill in and back out via
// breadcrumbs, create a new folder, and confirm a choice as a vault-style path. `Modal` and
// `Setting` are replaced with small real-DOM-backed stand-ins (Obsidian's own are opaque),
// backed by the jsdom environment installed globally in test/support/setup.ts.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam, RequestResponse } from '@/modules/registrar';

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

class ModalSpy {
	contentEl = document.createElement('div');
	title = '';
	closed = false;
	opened = false;
	setTitle(title: string) {
		this.title = title;
		return this;
	}
	open() {
		this.opened = true;
	}
	close() {
		this.closed = true;
		// Not declared as a class field: under define semantics that would shadow the
		// subclass's own `onClose()` prototype method with an own `undefined` property.
		(this as unknown as { onClose?: () => void }).onClose?.();
	}
}

type ButtonSpy = {
	disabled: boolean;
	onClick: (fn: () => void) => ButtonSpy;
	setButtonText: (text: string) => ButtonSpy;
	setCta: () => ButtonSpy;
	setDisabled: (value: boolean) => ButtonSpy;
	setTooltip: (text: string) => ButtonSpy;
	tooltip: string;
	trigger: () => void;
};
function buttonSpy(): ButtonSpy {
	let onClickHandler: (() => void) | undefined;
	const button: ButtonSpy = {
		disabled: false,
		onClick: (fn) => {
			onClickHandler = fn;
			return button;
		},
		setButtonText: () => button,
		setCta: () => button,
		setDisabled: (value) => {
			button.disabled = value;
			return button;
		},
		setTooltip: (text) => {
			button.tooltip = text;
			return button;
		},
		tooltip: '',
		trigger: () => onClickHandler?.(),
	};
	return button;
}

const settingSpies: Array<SettingSpy> = [];

class SettingSpy {
	buttons: Array<ButtonSpy> = [];
	texts: Array<{
		getValue: () => string;
		keydown: (key: string) => void;
		setValue: (v: string) => void;
	}> = [];
	constructor(_containerEl: unknown) {
		settingSpies.push(this);
	}
	addText(
		cb: (t: {
			getValue: () => string;
			inputEl: HTMLInputElement;
			setPlaceholder: () => unknown;
		}) => void,
	) {
		let value = '';
		const inputEl = document.createElement('input');
		const component = {
			getValue: () => value,
			inputEl,
			setPlaceholder: () => component,
		};
		cb(component);
		this.texts.push({
			getValue: () => value,
			keydown: (key: string) => {
				inputEl.dispatchEvent(new KeyboardEvent('keydown', { key }));
			},
			setValue: (next: string) => void (value = next),
		});
		return this;
	}
	addButton(cb: (b: ButtonSpy) => void) {
		const button = buttonSpy();
		this.buttons.push(button);
		cb(button);
		return this;
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: SettingSpy,
}));

const { default: FolderPickerModal } = await import('@/gdrive/folder-picker');

type FolderJson = { id: string; name: string };
type StubResponse = { json?: unknown; status?: number };
type Handler = (url: string, params: RequestParam) => Promise<StubResponse>;

function fakeRequest(handler: Handler) {
	const calls: Array<{ params: RequestParam; url: string }> = [];
	const request = async (url: string, params: RequestParam = {}): Promise<RequestResponse> => {
		calls.push({ params, url });
		const result = await handler(url, params);
		return {
			bytes: () => new Uint8Array(),
			headers: {},
			// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- must match RequestResponse.json's generic signature
			json: <T extends object = object>() => (result.json ?? {}) as T,
			status: result.status ?? 200,
			text: () => '',
		};
	};
	return { calls, request };
}

function listResponse(files: Array<FolderJson>): StubResponse {
	return { json: { files } };
}

async function flush(turns = 6) {
	for (let i = 0; i < turns; i++) await Promise.resolve();
}

test('lists the folders at the root and lets a choice bubble up', async () => {
	const { request } = fakeRequest(() =>
		Promise.resolve(listResponse([{ id: 'f1', name: 'Notes' }])),
	);
	const chosen: Array<string> = [];
	const modal = new FolderPickerModal({} as never, {
		onChoose: (path) => chosen.push(path),
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();
	await flush();

	const rows = [...modal.contentEl.querySelectorAll('.drive-bridge-folder-row')];
	expect(rows).toHaveLength(1);
	expect(rows[0]?.textContent).toContain('Notes');

	const setting = settingOf(modal);
	expect(setting.buttons[1]?.disabled).toBe(true); // "use this folder" at the root

	rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await flush();
	const crumbs = [...modal.contentEl.querySelectorAll('.drive-bridge-folder-crumbs a')].map(
		(a) => a.textContent,
	);
	expect(crumbs).toStrictEqual(['myDrive', 'Notes']);

	const useThis = settingOf(modal).buttons[1];
	expect(useThis?.disabled).toBe(false);
	useThis?.trigger();
	expect(chosen).toStrictEqual(['Notes/']);
	expect(modal.closed).toBe(true);
});

// The picker rebuilds its Setting row on every render() call; the latest one reflects the
// current folder.
function settingOf(_modal: ModalSpy) {
	return settingSpies.at(-1) as SettingSpy;
}

test('breadcrumbs jump back to an earlier folder', async () => {
	const calls: Array<string> = [];
	const { request } = fakeRequest((url) => {
		const q = new URL(url).searchParams.get('q') ?? '';
		calls.push(q);
		if (q.includes("'root'")) return Promise.resolve(listResponse([{ id: 'a', name: 'A' }]));
		return Promise.resolve(listResponse([{ id: 'b', name: 'B' }]));
	});
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();
	await flush();

	let row = modal.contentEl.querySelector('.drive-bridge-folder-row');
	row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await flush();
	row = modal.contentEl.querySelector('.drive-bridge-folder-row');
	row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await flush();
	expect(
		[...modal.contentEl.querySelectorAll('.drive-bridge-folder-crumbs a')].map(
			(a) => a.textContent,
		),
	).toStrictEqual(['myDrive', 'A', 'B']);

	const rootCrumb = modal.contentEl.querySelector('.drive-bridge-folder-crumbs a');
	rootCrumb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await flush();
	expect(
		[...modal.contentEl.querySelectorAll('.drive-bridge-folder-crumbs a')].map(
			(a) => a.textContent,
		),
	).toStrictEqual(['myDrive']);
});

test('shows an empty state with no subfolders, and a spinner while loading', async () => {
	let resolveList: (() => void) | undefined;
	const { request } = fakeRequest(
		() =>
			new Promise<StubResponse>((resolve) => {
				resolveList = () => resolve(listResponse([]));
			}),
	);
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();

	expect(modal.contentEl.querySelector('.drive-bridge-spin')).not.toBeNull();
	resolveList?.();
	await flush();
	expect(modal.contentEl.querySelector('.drive-bridge-folder-empty')?.textContent).toBe(
		'noSubfolders',
	);
});

test('a listing failure shows a Notice and an empty state', async () => {
	const { request } = fakeRequest(() => Promise.resolve({ status: 500 }));
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	notices.length = 0;
	modal.onOpen();
	await flush();

	expect(notices[0]?.message).toContain('folderListFailed');
	expect(modal.contentEl.querySelector('.drive-bridge-folder-empty')).not.toBeNull();
});

test('creating a folder with a slash is refused before any request', async () => {
	const { request } = fakeRequest(() => Promise.resolve(listResponse([])));
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();
	await flush();

	notices.length = 0;
	const setting = settingOf(modal);
	setting.texts[0]?.setValue('a/b');
	setting.texts[0]?.keydown('Enter');
	await flush();
	expect(notices[0]?.message).toBe('folderNameSlash');
});

test('creating a folder enters it once created', async () => {
	let createCalled = false;
	const { request } = fakeRequest((url, params) => {
		if (params.method === 'POST') {
			createCalled = true;
			return Promise.resolve({ json: { id: 'new', name: 'New folder' } });
		}
		return Promise.resolve(listResponse(createCalled ? [] : []));
	});
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();
	await flush();

	const setting = settingOf(modal);
	setting.texts[0]?.setValue('New folder');
	setting.texts[0]?.keydown('Enter');
	await flush();

	expect(createCalled).toBe(true);
	expect(
		[...modal.contentEl.querySelectorAll('.drive-bridge-folder-crumbs a')].map(
			(a) => a.textContent,
		),
	).toStrictEqual(['myDrive', 'New folder']);
});

test('the new-folder button reads the same field as Enter', async () => {
	const { request } = fakeRequest((url, params) =>
		params.method === 'POST'
			? Promise.resolve({ json: { id: 'new', name: 'Via button' } })
			: Promise.resolve(listResponse([])),
	);
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.onOpen();
	await flush();

	const setting = settingOf(modal);
	setting.texts[0]?.setValue('Via button');
	setting.buttons[0]?.trigger();
	await flush();

	expect(
		[...modal.contentEl.querySelectorAll('.drive-bridge-folder-crumbs a')].map(
			(a) => a.textContent,
		),
	).toStrictEqual(['myDrive', 'Via button']);
});

test('onClose empties the content element', () => {
	const modal = new FolderPickerModal({} as never, {
		onChoose: () => {},
		request: fakeRequest(() => Promise.resolve(listResponse([]))).request,
		translate: ((key: string) => key) as never,
	}) as unknown as ModalSpy & { onOpen: () => void };
	modal.contentEl.append(document.createElement('div'));
	(modal as unknown as { onClose: () => void }).onClose();
	expect(modal.contentEl.children).toHaveLength(0);
});
