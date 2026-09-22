import type { SettingGroupItem } from 'obsidian';
import { apiVersion, Platform } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import { VERSION } from '@/modules/event-bus';
import { s } from './utils';

const ISSUES_URL = 'https://github.com/mmayadag/drive-bridge/issues/new';
const COFFEE_URL = 'https://buymeacoffee.com/muratmayadag';

export type SupportSettingTranslations = {
	support: string;
	reportProblem: string;
	reportProblemDescription: string;
	openGithub: string;
	buyMeACoffee: string;
	buyMeACoffeeDescription: string;
	openPage: string;
};

function platformName() {
	if (Platform.isIosApp) return 'iOS';
	if (Platform.isAndroidApp) return 'Android';
	if (Platform.isMacOS) return 'macOS';
	if (Platform.isWin) return 'Windows';
	if (Platform.isLinux) return 'Linux';
	return 'unknown';
}

/**
 * Opens GitHub's new-issue form with the versions already filled in. Nothing is sent from
 * here: the browser opens the form, and the report is whatever the user writes and submits.
 */
export function reportUrl(): string {
	const body = [
		'## What happened',
		'',
		'',
		'## What you expected',
		'',
		'',
		'## Steps',
		'',
		'1. ',
		'',
		'## Environment',
		'',
		`- Drive Bridge: ${VERSION}`,
		`- Obsidian: ${apiVersion}`,
		`- Platform: ${platformName()}`,
		'',
		'Logs help: Settings → Drive Bridge → Export logs to file, then read the file and',
		'paste the relevant part here.',
	].join('\n');
	return `${ISSUES_URL}?body=${encodeURIComponent(body)}`;
}

export default function supportSettings({
	translate,
}: {
	translate: Translate<SupportSettingTranslations>;
}): CallableOrObjectTree {
	return {
		6000: s(
			(self) => ({
				heading: translate('support'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('reportProblemDescription'),
					name: translate('reportProblem'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('openGithub'))
								.setIcon('bug')
								.onClick(() => window.open(reportUrl())),
						);
					},
				})),
				2000: s(() => ({
					desc: translate('buyMeACoffeeDescription'),
					name: translate('buyMeACoffee'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setCta()
								.setButtonText(translate('openPage'))
								.onClick(() => window.open(COFFEE_URL)),
						);
					},
				})),
			},
		),
	};
}
