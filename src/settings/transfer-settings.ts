import type { Settings } from '@';
import type { App } from 'obsidian';
import { Notice, TFile } from 'obsidian';
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
	lastExport: (last: { path: string; time: string }) => string;
	openLastExport: (path: string) => string;
	importSettings: string;
	importSettingsDescription: string;
	includeAccount: string;
	includeAccountDescription: string;
	passphrase: string;
	passphraseDescription: string;
	repeatPassphrase: string;
	passphraseTooShort: string;
	passphraseMismatch: string;
	showExport: string;
	exportShown: string;
	selectAll: string;
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
				settings.lastExport = { at: Date.now(), path };
				void ctx.saveSettings();
				ctx.rerenderSettingTab();
				return path;
			},
			texts: {
				includeAccount: t('includeAccount'),
				includeAccountDescription: t('includeAccountDescription'),
				passphrase: t('passphrase'),
				passphraseDescription: t('passphraseDescription'),
				passphraseMismatch: t('passphraseMismatch'),
				passphraseTooShort: t('passphraseTooShort'),
				repeatPassphrase: t('repeatPassphrase'),
				saveToVault: t('saveToVault'),
				saved: (path) => t('exportSaved', path),
				selectAll: t('selectAll'),
				show: t('showExport'),
				shown: t('exportShown'),
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

	const lastExportFile = () => {
		const path = settings.lastExport?.path;
		const file = path ? app.vault.getAbstractFileByPath(path) : undefined;
		return file instanceof TFile ? file : undefined;
	};
	// Save to vault leaves a file that syncs like any note: say where, and when.
	const describeExport = () => {
		const file = lastExportFile();
		if (!file || !settings.lastExport) return t('exportSettingsDescription');
		return createFragment((frag) => {
			frag.appendText(t('exportSettingsDescription'));
			frag.createDiv({
				cls: 'drive-bridge-last-export',
				text: t('lastExport', {
					path: file.path,
					time: formatDateTime(settings.lastExport?.at ?? 0),
				}),
			});
		});
	};

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
							desc: describeExport(),
							name: t('exportSettings'),
							render: (setting) => {
								const file = lastExportFile();
								// The last export, one tap away, while it is still in the vault.
								if (file)
									setting.addExtraButton((button) =>
										button
											.setIcon('file-json')
											.setTooltip(t('openLastExport', file.path))
											.onClick(
												() =>
													void app.workspace.openLinkText(
														file.path,
														'',
														true,
													),
											),
									);
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
