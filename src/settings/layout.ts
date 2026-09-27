import type { Settings } from '@';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree, SettingTree } from '@/modules/setting';
import type { LabelDefinition } from './utils';
import { s } from './utils';

/**
 * Keys of the sub-pages under the main screen. Settings files place their rows at
 * `{ [MORE]: { [page]: { ... } } }`.
 */
/**
 * Main screen groups, in order: How it syncs (strategies, automatic sync, filters),
 * Deletions, the backend's own group (Google Drive at 551), then Advanced and Help.
 */
export const HOW = 100;
export const DELETIONS = 300;
/** Strategy pages inside How it syncs; modules add rows under the conflict page. */
export const SYNC_STRATEGY = 50;
export const CONFLICTS = 60;
export const MORE = 7000;
/** Help row and the coffee footer, after the sub-pages. */
export const HELP = 8000;
/** The hidden entry of the help page, just before the Help and support card. */
export const HELP_LINK = 7900;
export const HELP_LINK_CLASS = 'drive-bridge-help-link';
export const COFFEE = 9000;
export const PAGE = {
	advanced: 3000,
	automaticSync: 1000,
	filters: 2000,
	help: 4000,
} as const;
export const ADVANCED = {
	backend: 1500,
	controls: 1000,
	development: 5000,
	miscellaneous: 2000,
	reset: 6000,
	transfer: 5500,
	webhooks: 4000,
} as const;

export type LayoutSettingTranslations = {
	advanced: string;
	automaticSync: string;
	helpAndSupport: string;
	howItSyncs: string;
	deletions: string;
	filterRules: string;
	xConfigured: (count: number) => string;
	xOfYOn: (count: { on: number; total: number }) => string;
	automaticSyncPausedStatus: string;
};

const items = (self: SettingTree) => Object.values(self).map((node) => node(node));

export function countAutomaticSyncs(settings: Settings) {
	const flags = [
		settings.realtimeSync.enabled,
		settings.startupSync.enabled,
		settings.scheduledSync.enabled,
		settings.syncOnLeave,
		settings.syncOnFileOpen,
	];
	return { on: flags.filter(Boolean).length, total: flags.length };
}

export default function layoutSettings(ctx: {
	translate: Translate<LayoutSettingTranslations>;
	settings: Settings;
	speedLabel: () => LabelDefinition;
}): CallableOrObjectTree {
	const { translate, settings, speedLabel } = ctx;
	return {
		[HOW]: s(
			(self) => ({
				heading: translate('howItSyncs'),
				items: items(self) as never,
				type: 'group',
			}),
			{
				[PAGE.automaticSync]: s((self) => ({
					displayValue: () =>
						settings.automaticSyncPaused
							? translate('automaticSyncPausedStatus')
							: translate('xOfYOn', countAutomaticSyncs(settings)),
					items: items(self),
					name: translate('automaticSync'),
					type: 'page',
				})),
				[PAGE.filters]: s((self) => ({
					displayValue: () =>
						translate(
							'xConfigured',
							settings.inclusionRules.length + settings.exclusionRules.length,
						),
					items: items(self),
					labels: [speedLabel()],
					name: translate('filterRules'),
					type: 'page',
				})),
			},
		),
		[DELETIONS]: s(
			(self) => ({
				heading: translate('deletions'),
				items: items(self) as never,
				type: 'group',
			}),
			{},
		),
		[MORE]: s((self) => ({ items: items(self) as never, type: 'group' }), {
			[PAGE.advanced]: s((self) => ({
				items: items(self),
				name: translate('advanced'),
				type: 'page',
			})),
		}),
		// The help page. Its entry is hidden: the Help and support card below opens it.
		[HELP_LINK]: s(
			(self) => ({ cls: HELP_LINK_CLASS, items: items(self) as never, type: 'group' }),
			{
				[PAGE.help]: s((self) => ({
					items: items(self),
					name: translate('helpAndSupport'),
					type: 'page',
				})),
			},
		),
	};
}
