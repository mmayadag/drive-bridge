import type { Settings } from '@';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { LabelDefinition } from './utils';
import { MORE, PAGE } from './layout';
import { renderTogglableValue, s } from './utils';

export type FeaturesSettingTranslations = {
	realtimeSyncFastMode: string;
	realtimeSyncFastModeDescription: string;
	realtimeSync: string;
	realtimeSyncDescription: string;
	realtimeSyncPlaceholder: string;
	startupSync: string;
	startupSyncDescription: string;
	startupSyncPlaceholder: string;
	scheduledSync: string;
	scheduledSyncDescription: string;
	scheduledSyncPlaceholder: string;
	syncOnLeave: string;
	syncOnLeaveDescription: string;
};

export default function featuresSettings(ctx: {
	translate: Translate<FeaturesSettingTranslations>;
	saveSettings: () => Promise<void>;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	settings: Settings;
	speedLabel: () => LabelDefinition;
}): CallableOrObjectTree {
	const { translate, saveSettings, startScheduledSync, stopScheduledSync, settings, speedLabel } =
		ctx;
	return {
		[MORE]: {
			[PAGE.automaticSync]: {
				1000: s(() => ({
					desc: translate('realtimeSyncDescription'),
					name: translate('realtimeSync'),
					render: renderTogglableValue({
						field: settings.realtimeSync,
						placeholder: translate('realtimeSyncPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				2000: s(() => ({
					desc: translate('startupSyncDescription'),
					name: translate('startupSync'),
					render: renderTogglableValue({
						field: settings.startupSync,
						placeholder: translate('startupSyncPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				3000: s(() => ({
					desc: translate('scheduledSyncDescription'),
					name: translate('scheduledSync'),
					render: renderTogglableValue({
						field: settings.scheduledSync,
						onChange: () => {
							stopScheduledSync();
							startScheduledSync();
						},
						onToggle: (enabled) => {
							if (enabled) startScheduledSync();
							else stopScheduledSync();
						},
						placeholder: translate('scheduledSyncPlaceholder'),
						rejectZero: true,
						saveSettings,
						type: 'time',
					}),
				})),
				3500: s(() => ({
					control: { key: 'syncOnLeave', type: 'toggle' },
					desc: translate('syncOnLeaveDescription'),
					name: translate('syncOnLeave'),
				})),
				4000: s(() => ({
					control: {
						key: 'realtimeSyncFastMode',
						type: 'toggle',
					},
					desc: translate('realtimeSyncFastModeDescription'),
					labels: [speedLabel()],
					name: translate('realtimeSyncFastMode'),
				})),
			},
		},
	};
}
