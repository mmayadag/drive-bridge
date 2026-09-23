import type { ButtonComponent } from 'obsidian';
import { apiVersion, Platform, setIcon } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import { VERSION } from '@/modules/event-bus';
import { MORE, PAGE } from './layout';
import { s } from './utils';

const ISSUES_URL = 'https://github.com/mmayadag/drive-bridge/issues/new';
const COFFEE_URL = 'https://buymeacoffee.com/muratmayadag';

export type SupportSettingTranslations = {
	reportProblem: string;
	reportProblemDescription: string;
	reportBug: string;
	requestFeature: string;
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

export type ReportKind = 'bug' | 'request';

const TEMPLATES: Record<ReportKind, { label: string; sections: Array<string> }> = {
	bug: {
		label: 'bug',
		sections: [
			'## What happened',
			'',
			'',
			'## What you expected',
			'',
			'',
			'## Steps',
			'',
			'1. ',
		],
	},
	request: {
		label: 'enhancement',
		sections: ['## What you would like', '', '', '## Why it would help', '', ''],
	},
};

/**
 * Opens GitHub's new-issue form with the versions already filled in. Nothing is sent from
 * here: the browser opens the form, and the report is whatever the user writes and submits.
 */
export function reportUrl(kind: ReportKind = 'bug'): string {
	const { label, sections } = TEMPLATES[kind];
	const body = [
		...sections,
		'',
		'## Environment',
		'',
		`- Drive Bridge: ${VERSION}`,
		`- Obsidian: ${apiVersion}`,
		`- Platform: ${platformName()}`,
		...(kind === 'bug'
			? [
					'',
					'Logs help: Settings → Drive Bridge → Export logs to file, then read the file and',
					'paste the relevant part here.',
				]
			: []),
	].join('\n');
	return `${ISSUES_URL}?labels=${label}&body=${encodeURIComponent(body)}`;
}

// ButtonComponent.setIcon replaces the label, so both are built by hand.
function iconButton(button: ButtonComponent, icon: string, text: string) {
	button.buttonEl.empty();
	button.buttonEl.addClass('drive-bridge-icon-button');
	setIcon(button.buttonEl.createSpan(), icon);
	button.buttonEl.createSpan({ text });
	return button;
}

export default function supportSettings({
	translate,
}: {
	translate: Translate<SupportSettingTranslations>;
}): CallableOrObjectTree {
	return {
		[MORE]: {
			[PAGE.helpAndSupport]: {
				1000: s(() => ({
					desc: translate('reportProblemDescription'),
					name: translate('reportProblem'),
					render: (setting) => {
						setting
							.addButton((button) =>
								iconButton(button, 'bug', translate('reportBug')).onClick(() =>
									window.open(reportUrl('bug')),
								),
							)
							.addButton((button) =>
								iconButton(
									button,
									'lightbulb',
									translate('requestFeature'),
								).onClick(() => window.open(reportUrl('request'))),
							);
					},
				})),
				2000: s(() => ({
					desc: translate('buyMeACoffeeDescription'),
					name: translate('buyMeACoffee'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('openPage'))
								.onClick(() => window.open(COFFEE_URL)),
						);
					},
				})),
			},
		},
	};
}
