import type { Translate } from '@/modules/i18n';
import { s } from '@/settings/utils';
import type { RemoteScan } from './changes';

export type RemoteScanTranslations = {
	remoteScan: string;
	remoteScanDescription: string;
	remoteScanFull: string;
	remoteScanChanges: string;
};

/** Full scan or changes only, for how the Drive side is listed each sync. */
export default function remoteScanSetting(
	translate: Translate<RemoteScanTranslations>,
	settings: { remoteScan: RemoteScan },
	saveSettings: () => Promise<void>,
) {
	return s(() => ({
		desc: translate('remoteScanDescription'),
		name: translate('remoteScan'),
		render: (setting) => {
			setting.addDropdown((dropdown) =>
				dropdown
					.addOption('full', translate('remoteScanFull'))
					.addOption('changes', translate('remoteScanChanges'))
					.setValue(settings.remoteScan)
					.onChange((value) => {
						settings.remoteScan = value === 'changes' ? 'changes' : 'full';
						void saveSettings();
					}),
			);
		},
	}));
}
