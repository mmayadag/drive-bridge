import { apiVersion, Platform } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import { VERSION } from '@/modules/event-bus';
import { COFFEE, HELP } from './layout';
import { s } from './utils';

const GUIDE_URL = 'https://github.com/mmayadag/drive-bridge#readme';
const ISSUES_URL = 'https://github.com/mmayadag/drive-bridge/issues/new';
const COFFEE_URL = 'https://buymeacoffee.com/muratmayadag';

export type SupportSettingTranslations = {
	helpAndSupport: string;
	helpAndSupportDescription: string;
	help: string;
	reportBug: string;
	requestFeature: string;
	coffeeQuestion: string;
	buyMeACoffee: string;
	pluginVersion: (version: string) => string;
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

/**
 * Opens the GitHub issue form for a bug or a request with the versions filled in. Nothing
 * is sent from here: the browser opens the form, and the report is whatever the user
 * writes and submits. The field names match the ids in .github/ISSUE_TEMPLATE/.
 */
export function reportUrl(kind: ReportKind = 'bug'): string {
	const params = new URLSearchParams({
		obsidian: apiVersion,
		platform: platformName(),
		plugin: VERSION,
		template: `${kind}.yml`,
	});
	return `${ISSUES_URL}?${params.toString()}`;
}

export default function supportSettings({
	translate,
}: {
	translate: Translate<SupportSettingTranslations>;
}): CallableOrObjectTree {
	return {
		[HELP]: s(
			(self) => ({
				items: Object.values(self).map((node) => node(node)) as never,
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('helpAndSupportDescription'),
					name: translate('helpAndSupport'),
					render: (setting) => {
						setting
							.addExtraButton((button) =>
								button
									.setIcon('book-open')
									.setTooltip(translate('help'))
									.onClick(() => window.open(GUIDE_URL)),
							)
							.addExtraButton((button) =>
								button
									.setIcon('bug')
									.setTooltip(translate('reportBug'))
									.onClick(() => window.open(reportUrl('bug'))),
							)
							.addExtraButton((button) =>
								button
									.setIcon('lightbulb')
									.setTooltip(translate('requestFeature'))
									.onClick(() => window.open(reportUrl('request'))),
							);
					},
					search: false,
				})),
			},
		),
		[COFFEE]: s(
			(self) => ({
				items: Object.values(self).map((node) => node(node)) as never,
				type: 'group',
			}),
			{
				1000: s(() => ({
					name: translate('buyMeACoffee'),
					render: (setting) => {
						setting.settingEl.addClass('drive-bridge-coffee');
						const el = setting.controlEl;
						el.createDiv({
							cls: 'drive-bridge-coffee-question',
							text: translate('coffeeQuestion'),
						});
						const link = el.createEl('a', {
							attr: { href: COFFEE_URL, rel: 'noopener' },
							cls: 'drive-bridge-coffee-button',
						});
						drawCup(link);
						link.createSpan({ text: translate('buyMeACoffee') });
						el.createDiv({
							cls: 'drive-bridge-coffee-version',
							text: translate('pluginVersion', VERSION),
						});
					},
					search: false,
				})),
			},
		),
	};
}

// A takeaway cup drawn for this plugin, in the style of the Buy Me a Coffee button.
function drawCup(parent: HTMLElement) {
	const svg = parent.createSvg('svg', {
		attr: { 'aria-hidden': 'true', viewBox: '0 0 40 54' },
		cls: 'drive-bridge-coffee-cup',
	});
	svg.createSvg('path', {
		attr: {
			d: 'M10.5 26.5c3-2 6-2 9.5 0s7 2 10-.5L28.2 47.5c-.2 1.6-1.4 2.5-3 2.5H14.8c-1.6 0-2.8-.9-3-2.5z',
		},
		cls: 'drive-bridge-coffee-milk',
	});
	for (const d of [
		'M8 17l3.5 31c.2 1.6 1.4 2.5 3 2.5h11c1.6 0 2.8-.9 3-2.5L32 17',
		'M8 10.5h24a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z',
		'M9 10.5c0-5 22-6.5 22-1',
		'M13 8c3-2 12-2 14 0',
	])
		svg.createSvg('path', { attr: { d }, cls: 'drive-bridge-coffee-line' });
}
