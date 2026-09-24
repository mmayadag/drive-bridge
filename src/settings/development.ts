import type { Settings } from '@';
import type { App, SettingGroupItem } from 'obsidian';
import { Notice } from 'obsidian';
import type { Snippet, Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { MaybePromise } from '@/types';
import ConfirmModal from '@/components/confirm-modal';
import { resetSettings } from '@/defaults';
import { normalizeBaseDir } from '@/shared/path';
import { ADVANCED, MORE, PAGE } from './layout';
import { s } from './utils';

export type DevelopmentSettingTranslations = {
	development: string;
	clearRecords: string;
	recordsCleared: string;
	clear: string;
	clearRecordsDescription: string;
	clearRecordsConfirm: string;
	resetToDefaults: string;
	resetToDefaultsDescription: string;
	resetToDefaultsConfirm: string;
	settingsReset: string;
	skippedFiles: string;
	skippedFilesDescription: Snippet<number>;
	skippedFilesCleared: string;
	retry: string;
	cancel: string;
	export: string;
	exportLogsDescription: string;
	exportLogsDirectoryPlaceholder: string;
	exportLogsToFile: string;
	edit: string;
};

export default function developmentSettings({
	app,
	memoryDB,
	rerenderSettingTab,
	resetModuleSettings,
	startScheduledSync,
	stopScheduledSync,
	translate,
	exportLogs,
	deleteRecordStore,
	settings,
	saveSettings,
}: {
	app: App;
	memoryDB: { getStore: (name: 'ephemeralEditableLists') => { clear: () => void } };
	rerenderSettingTab: () => void;
	resetModuleSettings: () => void;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	translate: Translate<DevelopmentSettingTranslations>;
	deleteRecordStore: (namespace?: string) => MaybePromise<void>;
	exportLogs: () => Promise<void>;
	settings: Settings;
	saveSettings: () => Promise<void>;
}): CallableOrObjectTree {
	return {
		[MORE]: {
			[PAGE.advanced]: {
				[ADVANCED.development]: s(
					(self) => ({
						heading: translate('development'),
						items: Object.values(self).map((node) => node(node) as SettingGroupItem),
						type: 'group',
					}),
					{
						1000: s(() => ({
							desc: translate('clearRecordsDescription'),
							name: translate('clearRecords'),
							render: (setting) => {
								setting.addButton((button) =>
									button
										.setButtonText(translate('clearRecords'))
										.setDestructive()
										.onClick(() =>
											new ConfirmModal(app, {
												cancel: translate('cancel'),
												confirm: translate('clearRecords'),
												message: translate('clearRecordsConfirm'),
												onConfirm: async () => {
													await deleteRecordStore();
													new Notice(translate('recordsCleared'));
												},
												title: translate('clearRecords'),
											}).open(),
										),
								);
							},
						})),
						1500: s(() => ({
							desc: translate(
								'skippedFilesDescription',
								settings.skipState.skipped.length,
							),
							name: translate('skippedFiles'),
							render: (setting) => {
								setting.addButton((button) =>
									button
										.setButtonText(translate('retry'))
										.setDisabled(!settings.skipState.skipped.length)
										.onClick(async () => {
											settings.skipState = { failures: {}, skipped: [] };
											await saveSettings();
											new Notice(translate('skippedFilesCleared'));
											rerenderSettingTab();
										}),
								);
							},
						})),
						2000: s(() => ({
							desc: translate('exportLogsDescription'),
							name: translate('exportLogsToFile'),
							render: (setting) => {
								setting
									.addText((text) =>
										text
											.setValue(settings.exportLogsDirectory)
											.setPlaceholder(
												translate('exportLogsDirectoryPlaceholder'),
											)
											.inputEl.addEventListener('blur', () => {
												const normalized = normalizeBaseDir(
													text.getValue().trim(),
												);
												if (settings.exportLogsDirectory !== normalized) {
													settings.exportLogsDirectory = normalized;
													void saveSettings();
												}
												text.setValue(normalized);
											}),
									)
									.addButton((button) => {
										button
											.setButtonText(translate('export'))
											.onClick(exportLogs);
									});
							},
						})),
					},
				),
				[ADVANCED.reset]: s(
					(self) => ({
						items: Object.values(self).map((node) => node(node)) as never,
						type: 'group',
					}),
					{
						1000: s(() => ({
							desc: translate('resetToDefaultsDescription'),
							name: translate('resetToDefaults'),
							render: (setting) => {
								setting.addButton((button) =>
									button
										.setButtonText(translate('resetToDefaults'))
										.setDestructive()
										.onClick(() =>
											new ConfirmModal(app, {
												cancel: translate('cancel'),
												confirm: translate('resetToDefaults'),
												message: translate('resetToDefaultsConfirm'),
												onConfirm: async () => {
													resetSettings(settings, app.vault.configDir);
													resetModuleSettings();
													// Editable lists keep a working copy; drop it so they show the defaults.
													memoryDB
														.getStore('ephemeralEditableLists')
														.clear();
													stopScheduledSync();
													if (settings.scheduledSync.enabled)
														startScheduledSync();
													await saveSettings();
													new Notice(translate('settingsReset'));
													rerenderSettingTab();
												},
												title: translate('resetToDefaults'),
											}).open(),
										),
								);
							},
						})),
					},
				),
			},
		},
	};
}
