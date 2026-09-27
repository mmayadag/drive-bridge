import type { Events } from '@';
import type { App } from 'obsidian';
import { apiVersion, Platform } from 'obsidian';
import type { On } from '@/modules/event-bus';
import type { Translate } from '@/modules/i18n';
import type { LastSync } from '@/modules/observability';
import type { CallableOrObjectTree } from '@/modules/setting';
import { TextModal } from '@/components/selectable-text';
import { VERSION } from '@/modules/event-bus';
import type { HelpItem } from './help-list';
import { HelpListModal } from './help-list';
import { COFFEE, HELP } from './layout';
import { buildReport } from './problem-report';
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
	coffeeWorks: string;
	coffeeSetUp: string;
	coffeeFailed: string;
	buyMeACoffee: string;
	pluginVersion: (version: string) => string;
	problemReport: string;
	problemReportTitle: string;
	guideTitle: string;
	bugTitle: string;
	featureTitle: string;
	problemReportHint: string;
	selectAll: string;
};

function platformName() {
	if (Platform.isIosApp) return 'iOS';
	if (Platform.isAndroidApp) return 'Android';
	if (Platform.isMacOS) return 'macOS';
	if (Platform.isWin) return 'Windows';
	if (Platform.isLinux) return 'Linux';
	return 'unknown';
}

/** Shows a problem report (versions, settings without secrets, recent log) to paste into a Bug. */
export function showProblemReport(ctx: {
	app: App;
	settings: object;
	getLogs: () => string;
	translate: Translate<SupportSettingTranslations>;
}) {
	new TextModal(ctx.app, {
		hint: ctx.translate('problemReportHint'),
		selectAll: ctx.translate('selectAll'),
		text: buildReport({
			log: ctx.getLogs(),
			obsidian: apiVersion,
			platform: platformName(),
			plugin: VERSION,
			settings: ctx.settings as never,
		}),
		title: ctx.translate('problemReport'),
	}).open();
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

export type CoffeeQuestion = 'coffeeWorks' | 'coffeeSetUp' | 'coffeeFailed' | 'coffeeQuestion';

/** The line above the coffee button, following how the last sync on this device ended. */
export function coffeeQuestion(lastSync?: LastSync): CoffeeQuestion {
	if (!lastSync) return 'coffeeSetUp';
	if (lastSync.result === 'failed') return 'coffeeFailed';
	if (lastSync.result === 'cancelled') return 'coffeeQuestion';
	return 'coffeeWorks';
}

export default function supportSettings({
	app,
	translate,
	settings,
	on,
	getLogs,
}: {
	app: App;
	translate: Translate<SupportSettingTranslations>;
	settings: { lastSync?: LastSync };
	on: On<Events>;
	getLogs: () => string;
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
						const items: Array<HelpItem> = [
							{
								desc: translate('help'),
								icon: 'book-open',
								name: translate('guideTitle'),
								run: () => window.open(GUIDE_URL),
							},
							{
								desc: translate('reportBug'),
								icon: 'bug',
								name: translate('bugTitle'),
								run: () => window.open(reportUrl('bug')),
							},
							{
								desc: translate('requestFeature'),
								icon: 'lightbulb',
								name: translate('featureTitle'),
								run: () => window.open(reportUrl('request')),
							},
							{
								desc: translate('problemReport'),
								icon: 'file-text',
								name: translate('problemReportTitle'),
								run: () => showProblemReport({ app, getLogs, settings, translate }),
							},
						];
						for (const { icon, desc, run } of items)
							setting.addExtraButton((button) =>
								button.setIcon(icon).setTooltip(desc).onClick(run),
							);
						// The title and description open the same items as a labelled list.
						const openList = () =>
							new HelpListModal(app, {
								items,
								title: translate('helpAndSupport'),
							}).open();
						const info = setting.infoEl;
						info.addClass('drive-bridge-clickable');
						info.setAttr('role', 'button');
						info.setAttr('tabindex', '0');
						info.addEventListener('click', openList);
						info.addEventListener('keydown', (event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								openList();
							}
						});
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
						const question = el.createDiv({ cls: 'drive-bridge-coffee-question' });
						const ask = () =>
							question.setText(translate(coffeeQuestion(settings.lastSync)));
						ask();
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
						return on('syncTerminated', ask);
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
