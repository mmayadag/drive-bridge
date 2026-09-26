import type { Fragment, Translate } from '@/modules/i18n';
import { s } from '@/settings/utils';
import type { SetupStepKey } from './client-setup';
import { SETUP_STEPS } from './client-setup';

export type SetupPageTranslations = {
	setupPage: string;
	setupPageDescription: string;
	setupSteps: Fragment;
	openConsole: string;
} & Record<SetupStepKey, string> &
	Record<`${SetupStepKey}Description`, string>;

/**
 * The one-time Google Cloud steps, on a page of their own: someone who already has a
 * client and a token never needs them, and on a phone they pushed the fields far down.
 */
export default function setupPage(
	translate: Translate<SetupPageTranslations>,
	visible: () => boolean,
) {
	return s(
		(self) => ({
			desc: translate('setupPageDescription'),
			items: Object.values(self).map((node) => node(node)),
			name: translate('setupPage'),
			type: 'page',
			visible,
		}),
		{
			100: s(() => ({
				desc: translate('setupSteps'),
				name: 'dummy',
				render: (setting) => setting.settingEl.addClass('drive-bridge-setting-tip'),
				search: false,
			})),
			// One row per Google Cloud step, each opening its Console page.
			...Object.fromEntries(
				SETUP_STEPS.map(({ key, url }, index) => [
					200 + index,
					s(() => ({
						desc: translate(`${key}Description`),
						name: `${index + 1}. ${translate(key)}`,
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(translate('openConsole'))
									.onClick(() => window.open(url)),
							);
						},
						search: false,
					})),
				]),
			),
		},
	);
}
