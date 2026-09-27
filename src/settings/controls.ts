import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { PreviewSyncTranslations } from '@/modules/preview-sync';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { SyncOptions, SyncTerminateReason } from '@/modules/sync';
import type { Ref } from '@/shared/reactive';
import { previewSync } from '@/modules/preview-sync';
import type { LabelDefinition } from './utils';
import { ADVANCED, MORE, PAGE } from './layout';
import { renderTogglableValue, s } from './utils';

export type ControlsSettingTranslations = PreviewSyncTranslations & {
	controls: string;
	previewSyncDescription: string;
	preview: string;
	maxFileSize: string;
	maxFileSizeDescription: string;
	maxFileSizePlaceholder: string;
	maxRequestConcurrency: string;
	minRequestInterval: string;
	minRequestIntervalDescription: string;
	minRequestIntervalPlaceholder: string;
	maxRequestConcurrencyPlaceholder: string;
	maxRequestConcurrencyDescription: string;
	maxMemoryConsumption: string;
	maxMemoryConsumptionDescription: string;
	maxMemoryConsumptionPlaceholder: string;
};

export default function controlsSettings({
	translate,
	saveSettings,
	settings,
	speedLabel,
	isIdle,
	executeSync,
}: {
	isIdle: Ref<boolean>;
	executeSync: (trigger: string, options?: SyncOptions) => Promise<SyncTerminateReason>;
	translate: Translate<ControlsSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	speedLabel: () => LabelDefinition;
}): CallableOrObjectTree {
	return {
		[MORE]: {
			[PAGE.advanced]: {
				[ADVANCED.controls]: s(
					(self) => ({
						heading: translate('controls'),
						items: Object.values(self).map((node) => node(node) as SettingGroupItem),
						type: 'group',
					}),
					{
						// Seeing what a sync would do comes before tuning how it runs.
						100: s(() => ({
							desc: translate('previewSyncDescription'),
							name: translate('previewSync'),
							render: (setting) => {
								setting.addButton((button) =>
									button
										.setButtonText(translate('preview'))
										.onClick(() => previewSync({ executeSync, isIdle })),
								);
							},
						})),
						1000: s(() => ({
							desc: translate('maxFileSizeDescription'),
							name: translate('maxFileSize'),
							render: renderTogglableValue({
								field: settings.maxFileSize,
								placeholder: translate('maxFileSizePlaceholder'),
								rejectZero: true,
								saveSettings,
								type: 'fileSize',
							}),
						})),
						2000: s(() => ({
							desc: translate('maxRequestConcurrencyDescription'),
							labels: [speedLabel()],
							name: translate('maxRequestConcurrency'),
							render: renderTogglableValue({
								field: settings.maxRequestConcurrency,
								placeholder: translate('maxRequestConcurrencyPlaceholder'),
								rejectZero: true,
								saveSettings,
								type: 'number',
							}),
						})),
						3000: s(() => ({
							desc: translate('minRequestIntervalDescription'),
							labels: [speedLabel()],
							name: translate('minRequestInterval'),
							render: renderTogglableValue({
								field: settings.minRequestInterval,
								placeholder: translate('minRequestIntervalPlaceholder'),
								saveSettings,
								type: 'time',
							}),
						})),
						4000: s(() => ({
							desc: translate('maxMemoryConsumptionDescription'),
							labels: [speedLabel()],
							name: translate('maxMemoryConsumption'),
							render: renderTogglableValue({
								field: settings.maxMemoryConsumption,
								placeholder: translate('maxMemoryConsumptionPlaceholder'),
								rejectZero: true,
								saveSettings,
								type: 'fileSize',
							}),
						})),
					},
				),
			},
		},
	};
}
