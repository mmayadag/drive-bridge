import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import { Notice } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { MaybePromise } from '@/types';
import { normalizeBaseDir } from '@/shared/path';
import { s } from './utils';

export type DevelopmentSettingTranslations = {
	development: string;
	clearRecords: string;
	recordsCleared: string;
	clear: string;
	clearRecordsDescription: string;
	export: string;
	exportLogsDescription: string;
	exportLogsDirectoryPlaceholder: string;
	exportLogsToFile: string;
	edit: string;
};

export default function developmentSettings({
	translate,
	exportLogs,
	deleteRecordStore,
	settings,
	saveSettings,
}: {
	translate: Translate<DevelopmentSettingTranslations>;
	deleteRecordStore: (namespace?: string) => MaybePromise<void>;
	exportLogs: () => Promise<void>;
	settings: Settings;
	saveSettings: () => Promise<void>;
}): CallableOrObjectTree {
	return {
		5000: s(
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
								.onClick(async () => {
									await deleteRecordStore();
									new Notice(translate('recordsCleared'));
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
									.setPlaceholder(translate('exportLogsDirectoryPlaceholder'))
									.inputEl.addEventListener('blur', () => {
										const normalized = normalizeBaseDir(text.getValue().trim());
										if (settings.exportLogsDirectory !== normalized) {
											settings.exportLogsDirectory = normalized;
											void saveSettings();
										}
										text.setValue(normalized);
									}),
							)
							.addButton((button) => {
								button.setButtonText(translate('export')).onClick(exportLogs);
							});
					},
				})),
			},
		),
	};
}
