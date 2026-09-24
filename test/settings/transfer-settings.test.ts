// createTransfer: exporting settings to JSON/vault file, and importing them back —
// previewing changes, decrypting secrets, and confirming before overwriting an existing
// account. The modals themselves are stubbed to hand back the options they were built
// with, since they need real DOM to render.

import type { SettingDefinition } from 'obsidian';
import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';
import { buildTransfer } from '@/settings/transfer';
import { seal } from '@/shared/secret-box';

const notices: Array<{ message: string; timeout?: number }> = [];
function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

type ConfirmOptions = {
	title: string;
	message: string;
	confirm: string;
	cancel: string;
	onConfirm: () => unknown;
	onCancel?: () => unknown;
};
const confirmModals: Array<ConfirmOptions> = [];
class ConfirmModalSpy {
	opened = false;
	constructor(
		_app: unknown,
		private readonly options: ConfirmOptions,
	) {
		confirmModals.push(options);
	}
	open() {
		this.opened = true;
	}
}

type ExportOptions = {
	texts: Record<string, unknown>;
	build: (passphrase?: string) => Promise<string>;
	save: (text: string) => Promise<string>;
};
type ImportOptions = {
	texts: Record<string, unknown>;
	preview: (text: string) => { valid: boolean; changes?: number; hasSecrets?: boolean };
	apply: (text: string, passphrase: string) => Promise<void>;
};
const exportModals: Array<ExportOptions> = [];
const importModals: Array<ImportOptions> = [];
class ExportModalSpy {
	opened = false;
	constructor(
		_app: unknown,
		public options: ExportOptions,
	) {
		exportModals.push(options);
	}
	open() {
		this.opened = true;
	}
}
class ImportModalSpy {
	opened = false;
	constructor(
		_app: unknown,
		public options: ImportOptions,
	) {
		importModals.push(options);
	}
	open() {
		this.opened = true;
	}
}

void mock.module('obsidian', () => ({ ...ObsidianMock, Notice: NoticeSpy }));
void mock.module('@/components/confirm-modal', () => ({ default: ConfirmModalSpy }));
void mock.module('@/components/transfer-modal', () => ({
	ExportModal: ExportModalSpy,
	ImportModal: ImportModalSpy,
}));

const { createTransfer } = await import('@/settings/transfer-settings');

type ParsedTransfer = {
	format: string;
	settings: Record<string, unknown>;
	secrets?: string;
};
const parseJson = (text: string) => JSON.parse(text) as ParsedTransfer;

// Decrypting a sealed transfer runs a real PBKDF2 derivation, which takes actual wall-clock
// time rather than a fixed number of microtask ticks.
async function waitUntil(check: () => boolean, timeoutMs = 2000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error('waitUntil timed out');
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
	}
}

function baseSettings() {
	return {
		decider: 'bidirectional',
		modules: { gdrive: { clientId: 'existing-client' } },
		scheduledSync: { enabled: false },
	};
}

function baseCtx(overrides: Record<string, unknown> = {}) {
	const created: Array<[string, string]> = [];
	const saved: Array<true> = [];
	const rerendered: Array<true> = [];
	return {
		app: {
			vault: {
				create: (path: string, text: string) => {
					created.push([path, text]);
					return Promise.resolve();
				},
			},
		} as never,
		created,
		exportModuleSecrets: () => ({}),
		importModuleSecrets: () => Promise.resolve([]),
		memoryDB: { getStore: () => ({ clear: () => {} }) },
		rerenderSettingTab: () => void rerendered.push(true),
		rerendered,
		saveSettings: () => {
			saved.push(true);
			return Promise.resolve();
		},
		saved,
		settings: baseSettings(),
		startScheduledSync: () => {},
		stopScheduledSync: () => {},
		translate: ((key: string, arg?: unknown) =>
			arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) as never,
		...overrides,
	};
}

test('openExport builds an unsealed JSON transfer by default', async () => {
	exportModals.length = 0;
	const ctx = baseCtx();
	createTransfer(ctx as never).openExport();
	expect(exportModals).toHaveLength(1);

	const text = await exportModals[0]?.build();
	const parsed = parseJson(text ?? '{}');
	expect(parsed.format).toBe('drive-bridge-settings');
	expect(parsed.settings.decider).toBe('bidirectional');
	expect(parsed.secrets).toBeUndefined();
});

test('openExport seals secrets only when a passphrase is given', async () => {
	exportModals.length = 0;
	const ctx = baseCtx({ exportModuleSecrets: () => ({ gdrive: { refreshToken: 'r' } }) });
	createTransfer(ctx as never).openExport();

	const withoutPassphrase = parseJson((await exportModals[0]?.build()) ?? '{}');
	expect(withoutPassphrase.secrets).toBeUndefined();

	const withPassphrase = parseJson((await exportModals[0]?.build('long-enough')) ?? '{}');
	expect(typeof withPassphrase.secrets).toBe('string');
});

test('the export save callback writes a timestamped file to the vault', async () => {
	exportModals.length = 0;
	const ctx = baseCtx();
	createTransfer(ctx as never).openExport();

	const path = await exportModals[0]?.save('{"a":1}');
	expect(path).toMatch(/^Drive Bridge settings .*\.json$/u);
	expect(ctx.created[0]?.[0]).toBe(path);
	expect(ctx.created[0]?.[1]).toBe('{"a":1}');
});

test('preview rejects text that is not a Drive Bridge export', () => {
	importModals.length = 0;
	createTransfer(baseCtx() as never).openImport();
	expect(importModals[0]?.preview('not json')).toStrictEqual({ valid: false });
	expect(importModals[0]?.preview('{}')).toStrictEqual({ valid: false });
});

test('preview reports how many settings would change and whether secrets are included', async () => {
	importModals.length = 0;
	const ctx = baseCtx();
	createTransfer(ctx as never).openImport();

	const noChange = await buildTransfer(ctx.settings, {});
	expect(importModals[0]?.preview(JSON.stringify(noChange))).toStrictEqual({
		changes: 0,
		hasSecrets: false,
		valid: true,
	});

	const changed = await buildTransfer({ ...ctx.settings, decider: 'mirror' }, {});
	expect(importModals[0]?.preview(JSON.stringify(changed))).toStrictEqual({
		changes: 1,
		hasSecrets: false,
		valid: true,
	});

	const withSecrets = await buildTransfer(ctx.settings, { gdrive: { refreshToken: 'r' } }, 'pw');
	expect(importModals[0]?.preview(JSON.stringify(withSecrets))).toStrictEqual({
		changes: 0,
		hasSecrets: true,
		valid: true,
	});
});

test('apply rejects text that is not a Drive Bridge export', () => {
	importModals.length = 0;
	createTransfer(baseCtx() as never).openImport();
	expect(importModals[0]?.apply('nope', '')).rejects.toThrow('notAnExport');
});

test('apply reports a wrong passphrase distinctly from other failures', async () => {
	importModals.length = 0;
	const ctx = baseCtx();
	createTransfer(ctx as never).openImport();
	const sealed = await buildTransfer(
		ctx.settings,
		{ gdrive: { refreshToken: 'r' } },
		'right-pass',
	);

	expect(importModals[0]?.apply(JSON.stringify(sealed), 'wrong-pass')).rejects.toThrow(
		'wrongPassphrase',
	);
});

test('apply rethrows a failure that is not a wrong passphrase', async () => {
	// The right passphrase decrypts fine, but the plaintext underneath isn't valid JSON —
	// something openSecrets' own JSON.parse throws on, distinct from a WrongPassphraseError.
	importModals.length = 0;
	const ctx = baseCtx();
	createTransfer(ctx as never).openImport();
	const transfer = {
		exported: new Date().toISOString(),
		format: 'drive-bridge-settings',
		secrets: await seal('not valid json', 'pw'),
		settings: {},
		version: 1,
	};

	expect(importModals[0]?.apply(JSON.stringify(transfer), 'pw')).rejects.toThrow(/JSON/iu);
});

test('apply with no secrets updates settings and imports nothing further', async () => {
	importModals.length = 0;
	notices.length = 0;
	const ctx = baseCtx({ settings: { ...baseSettings(), scheduledSync: { enabled: true } } });
	let started = false;
	ctx.startScheduledSync = () => void (started = true);
	createTransfer(ctx as never).openImport();
	const transfer = await buildTransfer({ ...ctx.settings, decider: 'mirror' }, {});

	await importModals[0]?.apply(JSON.stringify(transfer), '');

	expect(ctx.settings.decider).toBe('mirror');
	expect(started).toBe(true);
	expect(ctx.saved).toHaveLength(2);
	expect(ctx.rerendered).toStrictEqual([true]);
	expect(notices[0]?.message).toContain('settingsImported');
});

test('apply confirms before replacing an existing account, and honors a cancel', async () => {
	importModals.length = 0;
	confirmModals.length = 0;
	const ctx = baseCtx({ exportModuleSecrets: () => ({ gdrive: { refreshToken: 'existing' } }) });
	createTransfer(ctx as never).openImport();
	const transfer = await buildTransfer(
		{ ...ctx.settings, decider: 'mirror' },
		{ gdrive: { refreshToken: 'incoming' } },
		'pw',
	);

	const applied = importModals[0]?.apply(JSON.stringify(transfer), 'pw');
	await waitUntil(() => confirmModals.length > 0);
	expect(confirmModals).toHaveLength(1);

	confirmModals[0]?.onCancel?.();
	await applied;
	// Declined: nothing changed and no import completed.
	expect(ctx.settings.decider).toBe('bidirectional');
	expect(ctx.saved).toHaveLength(0);
});

test('confirming the account replacement proceeds with the import', async () => {
	importModals.length = 0;
	confirmModals.length = 0;
	const ctx = baseCtx({ exportModuleSecrets: () => ({ gdrive: { refreshToken: 'existing' } }) });
	createTransfer(ctx as never).openImport();
	const transfer = await buildTransfer(
		{ ...ctx.settings, decider: 'mirror' },
		{ gdrive: { refreshToken: 'incoming' } },
		'pw',
	);

	const applied = importModals[0]?.apply(JSON.stringify(transfer), 'pw');
	await waitUntil(() => confirmModals.length > 0);
	confirmModals[0]?.onConfirm();
	await applied;

	expect(ctx.settings.decider).toBe('mirror');
	expect(ctx.saved.length).toBeGreaterThan(0);
});

test('the export and import rows wire their buttons to openExport and openImport', () => {
	exportModals.length = 0;
	importModals.length = 0;
	const ctx = baseCtx();
	const { tree } = createTransfer(ctx as never);
	type Group = Record<number, () => SettingDefinition>;
	const group = (tree as never as Record<number, Record<number, Record<number, Group>>>)[MORE][
		PAGE.advanced
	][ADVANCED.transfer];

	let exportButtonClicked: (() => void) | undefined;
	group[1000]?.()?.render?.(
		{
			addButton: (cb: (b: unknown) => void) => {
				const button = {
					onClick: (fn: () => void) => {
						exportButtonClicked = fn;
						return button;
					},
					setButtonText: () => button,
				};
				cb(button);
			},
		} as never,
		undefined as never,
	);
	exportButtonClicked?.();
	expect(exportModals).toHaveLength(1);

	let importButtonClicked: (() => void) | undefined;
	group[2000]?.()?.render?.(
		{
			addButton: (cb: (b: unknown) => void) => {
				const button = {
					onClick: (fn: () => void) => {
						importButtonClicked = fn;
						return button;
					},
					setButtonText: () => button,
				};
				cb(button);
			},
		} as never,
		undefined as never,
	);
	importButtonClicked?.();
	expect(importModals).toHaveLength(1);
});

test('the modal texts that take a value pass it to the translation', () => {
	exportModals.length = 0;
	importModals.length = 0;
	const transfer = createTransfer(baseCtx() as never);
	transfer.openExport();
	transfer.openImport();

	const saved = exportModals[0]?.texts.saved as (path: string) => string;
	expect(saved('a.json')).toBe('exportSaved:"a.json"');
	const summary = importModals[0]?.texts.summary as (counts: unknown) => string;
	expect(summary({ changes: 2 })).toBe('importSummary:{"changes":2}');
});
