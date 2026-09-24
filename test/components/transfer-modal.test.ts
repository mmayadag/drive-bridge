import {
	ModalSpy,
	NoticeSpy,
	SettingSpy,
	button,
	notices,
	resetSpies,
	settings,
} from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import { beforeEach, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: SettingSpy,
}));
// Other files mock this module for the whole run; the query loads a fresh copy on these mocks.
const fresh = '@/components/transfer-modal.ts?fresh';
const { ExportModal, ImportModal } = (await import(
	fresh
)) as typeof import('@/components/transfer-modal');

beforeEach(resetSpies);

const exportTexts = {
	copied: 'Copied',
	copy: 'Copy',
	includeAccount: 'Include account',
	includeAccountDescription: '',
	passphrase: 'Passphrase',
	passphraseDescription: '',
	passphraseMismatch: 'Mismatch',
	passphraseTooShort: 'Too short',
	repeatPassphrase: 'Repeat',
	saveToVault: 'Save',
	saved: (path: string) => `Saved ${path}`,
	title: 'Export',
};

function openExport() {
	const built: Array<string | undefined> = [];
	const modal = new ExportModal({} as never, {
		build: (passphrase) => {
			built.push(passphrase);
			return Promise.resolve(`export:${passphrase ?? 'plain'}`);
		},
		save: (text) => Promise.resolve(`${text}.json`),
		texts: exportTexts,
	});
	modal.open();
	const row = (name: string) => settings.find((setting) => setting.name === name);
	const type = (name: string, value: string) => row(name)?.inputs[0]?.change(value);
	return { built, modal, row, type };
}

test('an export with the account needs a long, repeated passphrase', async () => {
	const { built, modal, type } = openExport();
	type('Passphrase', 'short');
	await button('Save').click();
	type('Passphrase', 'long enough');
	type('Repeat', 'long enougH');
	await button('Save').click();
	expect(notices).toStrictEqual(['Too short', 'Mismatch']);
	expect(built).toStrictEqual([]);
	type('Repeat', 'long enough');
	await button('Save').click();
	expect(built).toStrictEqual(['long enough']);
	expect(notices.at(-1)).toBe('Saved export:long enough.json');
	expect((modal as unknown as ModalSpy).closed).toBe(true);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('without the account, the export copies as it is', async () => {
	const copied: Array<string> = [];
	const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: (text: string) => Promise.resolve(void copied.push(text)) },
	});
	try {
		const { built, row } = openExport();
		await row('Include account')?.toggles[0]?.(false);
		expect(row('Passphrase')?.settingEl.style.display).toBe('none');
		await button('Copy').click();
		expect(built).toStrictEqual([undefined]);
		expect(copied).toStrictEqual(['export:plain']);
		expect(notices).toStrictEqual(['Copied']);
	} finally {
		if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
		else delete (navigator as { clipboard?: unknown }).clipboard;
	}
});

test('a copy that is not ready copies nothing', async () => {
	openExport();
	await button('Copy').click();
	expect(notices).toStrictEqual(['Too short']);
});

function openImport(apply: (text: string, passphrase: string) => Promise<void>) {
	const modal = new ImportModal({} as never, {
		apply,
		preview: (text) =>
			text.startsWith('{')
				? { changes: 3, hasSecrets: text.includes('secret'), valid: true }
				: { valid: false },
		texts: {
			import: 'Import',
			notAnExport: 'Not an export',
			passphrase: 'Passphrase',
			paste: 'Paste',
			summary: ({ changes }) => `${changes} changes`,
			title: 'Import',
		},
	});
	modal.open();
	const area = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
	const summary = () => modal.contentEl.querySelector('p')?.textContent;
	const paste = (text: string) => {
		area.value = text;
		// jsdom only takes its own events.
		const { Event: DomEvent } = area.ownerDocument.defaultView as unknown as typeof globalThis;
		area.dispatchEvent(new DomEvent('input'));
	};
	const secretRow = settings.find((setting) => setting.name === 'Passphrase');
	return { modal, paste, secretRow, summary };
}

test('import previews what it pastes and asks for the passphrase only with secrets', async () => {
	const applied: Array<[string, string]> = [];
	const { modal, paste, secretRow, summary } = openImport((text, passphrase) => {
		applied.push([text, passphrase]);
		return Promise.resolve();
	});
	const importButton = button('Import').buttonEl;
	expect(summary()).toBe('');
	expect(importButton.hasAttribute('disabled')).toBe(true);
	paste('hello');
	expect(summary()).toBe('Not an export');
	paste('{"secret"}');
	expect(summary()).toBe('3 changes');
	expect(secretRow?.settingEl.style.display).not.toBe('none');
	expect(importButton.hasAttribute('disabled')).toBe(false);
	secretRow?.inputs[0]?.change('pass phrase');
	await button('Import').click();
	expect(applied).toStrictEqual([['{"secret"}', 'pass phrase']]);
	expect((modal as unknown as ModalSpy).closed).toBe(true);
});

test('a failed import shows why and stays open', async () => {
	const { modal, paste } = openImport(() => Promise.reject(new Error('Wrong passphrase')));
	paste('{}');
	await button('Import').click();
	expect(notices).toStrictEqual(['Wrong passphrase']);
	expect((modal as unknown as ModalSpy).closed).toBe(false);
	resetSpies();
	// A non-Error rejection is the case under test.
	// oxlint-disable-next-line typescript/prefer-promise-reject-errors
	const other = openImport(() => Promise.reject('offline'));
	other.paste('{}');
	await button('Import').click();
	expect(notices).toStrictEqual(['offline']);
});
