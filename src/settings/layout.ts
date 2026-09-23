import type { Settings } from '@';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree, SettingTree } from '@/modules/setting';
import type { LabelDefinition } from './utils';
import { s } from './utils';

/**
 * Keys of the sub-pages under the main screen. Settings files place their rows at
 * `{ [MORE]: { [page]: { ... } } }`.
 */
export const MORE = 7000;
/** Help row and the coffee footer, after the sub-pages. */
export const HELP = 8000;
export const COFFEE = 9000;
export const PAGE = {
	advanced: 3000,
	automaticSync: 1000,
	filters: 2000,
} as const;
export const ADVANCED = {
	controls: 1000,
	development: 5000,
	miscellaneous: 2000,
	smartMerge: 3000,
	webhooks: 4000,
} as const;

export type LayoutSettingTranslations = {
	advanced: string;
	automaticSync: string;
	filterRules: string;
	xConfigured: (count: number) => string;
	xOfYOn: (count: { on: number; total: number }) => string;
};

const items = (self: SettingTree) => Object.values(self).map((node) => node(node));

export function countAutomaticSyncs(settings: Settings) {
	const flags = [
		settings.realtimeSync.enabled,
		settings.startupSync.enabled,
		settings.scheduledSync.enabled,
		settings.syncOnLeave,
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
		[MORE]: s((self) => ({ items: items(self) as never, type: 'group' }), {
			[PAGE.automaticSync]: s((self) => ({
				displayValue: () => translate('xOfYOn', countAutomaticSyncs(settings)),
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
			[PAGE.advanced]: s((self) => ({
				items: items(self),
				name: translate('advanced'),
				type: 'page',
			})),
		}),
	};
}
