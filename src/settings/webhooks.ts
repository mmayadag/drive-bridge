import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import { normalizeUrl } from '@/shared/path';
import { reactivelyValidate, s } from './utils';

export type WebhooksSettingTranslations = {
	webhooks: string;
	webhookOnStart: string;
	webhookOnStartDescription: string;
	webhookOnFinish: string;
	webhookOnFinishDescription: string;
	webhookPlaceholder: string;
	webhookOnlyWhenChanged: string;
	webhookOnlyWhenChangedDescription: string;
};

export default function webhooksSettings({
	translate,
	saveSettings,
	settings,
}: {
	translate: Translate<WebhooksSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
}): CallableOrObjectTree {
	const urlSetting = (key: 'webhookOnStart' | 'webhookOnFinish') =>
		s(() => ({
			desc: translate(`${key}Description`),
			name: translate(key),
			render: (setting) => {
				setting.addText((text) => {
					text.setPlaceholder(translate('webhookPlaceholder')).setValue(settings[key]);
					reactivelyValidate<string>({
						onSave: (value) => {
							settings[key] = value;
							void saveSettings();
						},
						parse: (value) => {
							const entered = value.trim();
							if (!entered) return '';
							const url = normalizeUrl(entered);
							// A webhook carries the vault name and the sync result; plain http
							// Would put both on the wire in the clear.
							if (!url.startsWith('https://')) throw new Error('Only https');
							return url;
						},
						text,
					});
				});
			},
		}));

	return {
		4500: s(
			(self) => ({
				heading: translate('webhooks'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: urlSetting('webhookOnStart'),
				2000: urlSetting('webhookOnFinish'),
				3000: s(() => ({
					control: { key: 'webhookOnlyWhenChanged', type: 'toggle' },
					desc: translate('webhookOnlyWhenChangedDescription'),
					name: translate('webhookOnlyWhenChanged'),
				})),
			},
		),
	};
}
