import type { Settings } from '@';
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { ImportPreview } from '@/components/transfer-modal';
import type { Snippet, Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import ConfirmModal from '@/components/confirm-modal';
import { ExportModal, ImportModal } from '@/components/transfer-modal';
import { WrongPassphraseError } from '@/shared/secret-box';
import formatDateTime from '@/utils/format-date';
import type { ModuleSecrets } from './transfer';
import { ADVANCED, MORE, PAGE } from './layout';
import {
	applySettings,
	buildTransfer,
	changedSettings,
	openSecrets,
	parseTransfer,
} from './transfer';
import { s } from './utils';

export type TransferTranslations = {
	cancel: string;
	exportSettings: string;
	exportSettingsDescription: string;
	importSettings: string;
	importSettingsDescription: string;
	includeAccount: string;
	includeAccountDescription: string;
	passphrase: string;
	passphraseDescription: string;
	repeatPassphrase: string;
	passphraseTooShort: string;
	passphraseMismatch: string;
	copyExport: string;
	exportCopied: string;
	saveToVault: string;
	exportSaved: Snippet<string>;
	pasteExport: string;
	notAnExport: string;
	importSummary: Snippet<{ changes: number; hasSecrets: boolean }>;
	importAction: string;
	wrongPassphrase: string;
	replaceAccount: string;
	replaceAccountConfirm: string;
	settingsImported: string;
};

type TransferContext = {
	app: App;
	translate: Translate<TransferTranslations>;
	settings: Settings;
	saveSettings: () => Promise<void>;
	rerenderSettingTab: () => void;
	exportModuleSecrets: () => ModuleSecrets;
	importModuleSecrets: (secrets: ModuleSecrets) => Promise<Array<string>>;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	memoryDB: { getStore: (name: 'ephemeralEditableLists') => { clear: () => void } };
};

const hasAny = (secrets: ModuleSecrets) =>
	Object.values(secrets).some((values) => Object.keys(values).length);

const confirmed = (
	app: App,
	texts: { title: string; message: string; confirm: string; cancel: string },
) =>
	new Promise<boolean>((resolve) => {
		new ConfirmModal(app, {
			...texts,
			onCancel: () => resolve(false),
			onConfirm: () => resolve(true),
		}).open();
	});

export function createTransfer(ctx: TransferContext) {
	const { app, translate: t, settings } = ctx;

	const openExport = () =>
		new ExportModal(app, {
			build: async (passphrase) =>
				JSON.stringify(
					await buildTransfer(
						settings,
						passphrase ? ctx.exportModuleSecrets() : {},
						passphrase,
					),
					undefined,
					2,
				),
			save: async (text) => {
				const stamp = formatDateTime(Date.now()).replaceAll(':', '-');
				const path = `Drive Bridge settings ${stamp}.json`;
				await app.vault.create(path, text);
				return path;
			},
			texts: {
				copied: t('exportCopied'),
				copy: t('copyExport'),
				includeAccount: t('includeAccount'),
				includeAccountDescription: t('includeAccountDescription'),
				passphrase: t('passphrase'),
				passphraseDescription: t('passphraseDescription'),
				passphraseMismatch: t('passphraseMismatch'),
				passphraseTooShort: t('passphraseTooShort'),
				repeatPassphrase: t('repeatPassphrase'),
				saveToVault: t('saveToVault'),
				saved: (path) => t('exportSaved', path),
				title: t('exportSettings'),
			},
		}).open();

	const preview = (text: string): ImportPreview => {
		const transfer = parseTransfer(text);
		if (!transfer) return { valid: false };
		return {
			changes: changedSettings(settings, transfer.settings).length,
			hasSecrets: Boolean(transfer.secrets),
			valid: true,
		};
	};

	const apply = async (text: string, passphrase: string) => {
		const transfer = parseTransfer(text);
		if (!transfer) throw new Error(t('notAnExport'));
		const secrets = await openSecrets(transfer, passphrase).catch((error: unknown) => {
			if (error instanceof WrongPassphraseError)
				throw new Error(t('wrongPassphrase'), { cause: error });
			throw error;
		});
		if (
			hasAny(secrets) &&
			hasAny(ctx.exportModuleSecrets()) &&
			!(await confirmed(app, {
				cancel: t('cancel'),
				confirm: t('replaceAccount'),
				message: t('replaceAccountConfirm'),
				title: t('importSettings'),
			}))
		)
			return;
		applySettings(settings, transfer.settings);
		// Editable lists keep a working copy; drop it so they show the imported values.
		ctx.memoryDB.getStore('ephemeralEditableLists').clear();
		ctx.stopScheduledSync();
		if (settings.scheduledSync.enabled) ctx.startScheduledSync();
		await ctx.saveSettings();
		const lines = await ctx.importModuleSecrets(secrets);
		await ctx.saveSettings();
		new Notice([t('settingsImported'), ...lines].join('\n'), 8000);
		ctx.rerenderSettingTab();
	};

	const openImport = () =>
		new ImportModal(app, {
			apply,
			preview,
			texts: {
				import: t('importAction'),
				notAnExport: t('notAnExport'),
				passphrase: t('passphrase'),
				paste: t('pasteExport'),
				summary: (counts) => t('importSummary', counts),
				title: t('importSettings'),
			},
		}).open();

	const tree: CallableOrObjectTree = {
		[MORE]: {
			[PAGE.advanced]: {
				[ADVANCED.transfer]: s(
					(self) => ({
						items: Object.values(self).map((node) => node(node)) as never,
						type: 'group',
					}),
					{
						1000: s(() => ({
							desc: t('exportSettingsDescription'),
							name: t('exportSettings'),
							render: (setting) => {
								setting.addButton((button) =>
									button.setButtonText(t('exportSettings')).onClick(openExport),
								);
							},
						})),
						2000: s(() => ({
							desc: t('importSettingsDescription'),
							name: t('importSettings'),
							render: (setting) => {
								setting.addButton((button) =>
									button.setButtonText(t('importSettings')).onClick(openImport),
								);
							},
						})),
					},
				),
			},
		},
	};

	return { openExport, openImport, tree };
}
