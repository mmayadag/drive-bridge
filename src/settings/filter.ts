import type { Settings } from '@';
import type { Fragment, Snippet, Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { DatabaseSync } from '@/shared/key-value-store';
import type { GlobMatchRule } from '@/types';
import { normalizeGlob } from '@/utils/glob-match';
import { MORE, PAGE } from './layout';
import { generateEditableList, reactivelyValidate, s } from './utils';

export type FilterSettingTranslations = {
	filterRules: string;
	inclusionRules: string;
	inclusionRulesDescription: Fragment;
	exclusionRules: string;
	exclusionRulesDescription: Fragment;
	xConfigured: Snippet<number>;
	addInclusionRule: string;
	addExclusionRule: string;
	noRuleConfigured: string;
	filterPlaceholder: string;
	caseSensitive: string;
};

export default function filterSettings({
	translate,
	saveSettings,
	settings,
	memoryDB,
	rerenderSettingTab,
}: {
	translate: Translate<FilterSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	memoryDB: DatabaseSync;
	rerenderSettingTab: () => void;
}): CallableOrObjectTree {
	return {
		[MORE]: {
			[PAGE.filters]: {
				1000: s(
					(self) => ({
						desc: translate('inclusionRulesDescription'),
						displayValue: () =>
							translate('xConfigured', settings.inclusionRules.length),
						items: Object.values(self).map((node) => node(node)),
						name: translate('inclusionRules'),
						type: 'page',
					}),
					{
						1000: s(() =>
							generateRuleList({
								add: translate('addInclusionRule'),
								empty: translate('noRuleConfigured'),
								identifier: 'inclusionRules',
								items: settings.inclusionRules,
							}),
						),
					},
				),
				2000: s(
					(self) => ({
						desc: translate('exclusionRulesDescription'),
						displayValue: () =>
							translate('xConfigured', settings.exclusionRules.length),
						items: Object.values(self).map((node) => node(node)),
						name: translate('exclusionRules'),
						type: 'page',
					}),
					{
						1000: s(() =>
							generateRuleList({
								add: translate('addExclusionRule'),
								empty: translate('noRuleConfigured'),
								identifier: 'exclusionRules',
								items: settings.exclusionRules,
							}),
						),
					},
				),
			},
		},
	};

	function generateRuleList({
		add,
		empty,
		identifier,
		items,
	}: {
		add: string;
		empty: string;
		identifier: string;
		items: Array<GlobMatchRule>;
	}) {
		return generateEditableList({
			defaultValue: { caseSensitive: false, expr: '' },
			identifier,
			items,
			memoryDB,
			render: (setting, item, save) => {
				setting.addText((text) => {
					text.setPlaceholder(translate('filterPlaceholder')).setValue(item.value.expr);
					reactivelyValidate<string>({
						immediate: true,
						onSave: (value) => {
							item.value.expr = value;
							save();
						},
						parse: (value) => {
							item.value.expr = value;
							const normalized = normalizeGlob(value);
							if (!normalized) {
								item.valid = false;
								save();
								return;
							}
							item.valid = true;
							return normalized;
						},
						text,
					});
					if (item.new) {
						item.new = false;
						text.inputEl.focus();
					}
				});
				setting.addExtraButton((button) => {
					const activeClasses = ['drive-bridge-toggle-active'];
					const updateStatus = () => {
						if (item.value.caseSensitive)
							button.extraSettingsEl.addClasses(activeClasses);
						else button.extraSettingsEl.removeClasses(activeClasses);
					};
					updateStatus();
					button
						.setIcon('case-sensitive')
						.setTooltip(translate('caseSensitive'))
						.onClick(() => {
							item.value.caseSensitive = !item.value.caseSensitive;
							updateStatus();
							save();
						});
				});
			},
			rerenderSettingTab,
			saveSettings,
			translations: { add, empty },
		});
	}
}
