import type { Events, Settings } from '@';
import { PluginSettingTab, setIcon } from 'obsidian';
import type { Dispatch, On } from '@/modules/event-bus';
import type { Snippet, Translate } from '@/modules/i18n';
import type { LastSync } from '@/modules/observability';
import type {
	CheckConnectionResult,
	ConflictResolverEntry,
	DeciderEntry,
	RemoteFsEntry,
} from '@/modules/registrar';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { Ref } from '@/shared/reactive';
import type { MaybePromise } from '@/types';
import formatDateTime from '@/utils/format-date';
import type { CheckConnectionDB } from './check-connection';
import type { AugmentedSettingDefinitionItem, LabelDefinition } from './utils';
import { addCheckConnection } from './check-connection';
import { addLabel, s } from './utils';

export type HeadSettingTranslations = {
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
	lastSync: string;
	lastSyncNever: string;
	lastSyncValue: Snippet<{ time: string; result: string }>;
	completed: string;
	completedNoop: string;
	cancelled: string;
	failed: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
	checkConnection: string;
	conflictResolveStrategy: string;
	conflictResolveStrategyDescription: string;
	startSync: string;
};

export default function headSettings(
	ctx: {
		translate: Translate<HeadSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
		remoteFsRegistry: Map<string, RemoteFsEntry>;
		deciderRegistry: Map<string, DeciderEntry>;
		conflictResolverRegistry: Map<string, ConflictResolverEntry>;
		getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
		memoryDB: CheckConnectionDB;
		matchLabel: () => LabelDefinition;
		dispatch: Dispatch<Events>;
		on: On<Events>;
		requestSync: (trigger: string) => unknown;
		isIdle: Ref<boolean>;
	},
	getSettingTab: () => PluginSettingTab | undefined,
): CallableOrObjectTree {
	const {
		translate,
		saveSettings,
		settings,
		remoteFsRegistry,
		deciderRegistry,
		conflictResolverRegistry,
		matchLabel,
		on,
		requestSync,
		isIdle,
	} = ctx;
	// Keys are render priorities and read in numeric order.
	// Sorted as strings, which is what the rule below does, 4900 precedes 50.
	// oxlint-disable-next-line sort-keys
	return {
		15: s(() => ({
			desc: describeLastSync(settings.lastSync, translate),
			name: translate('lastSync'),
			render: (setting) => {
				const icon = setting.controlEl.createSpan();
				// The tab can stay open through a sync, so the result is redrawn when one ends.
				const show = () => {
					const { lastSync } = settings;
					setting.setDesc(describeLastSync(lastSync, translate));
					if (!lastSync) return icon.hide();
					const failed = lastSync.result === 'failed';
					icon.className = failed
						? 'drive-bridge-status-error'
						: 'drive-bridge-status-ok';
					setIcon(icon, failed ? 'x' : 'check');
					icon.show();
				};
				show();
				const off = on('syncTerminated', show);
				// Labels are drawn once the whole tab has rendered; this row always renders first.
				queueMicrotask(() => {
					const tab = getSettingTab();
					if (!tab) return;
					const recurseLabel = (items: Array<AugmentedSettingDefinitionItem>) => {
						for (const item of items) {
							if ('labels' in item && item.labels) {
								const name = tab
									.getElementForDefinition(item)
									?.querySelector('.setting-item-name');
								if (name) for (const label of item.labels) addLabel(name, label);
							}
							if ('items' in item) recurseLabel(item.items as never);
						}
					};
					recurseLabel(tab.settingItems);
				});
				let unsubscribe = () => {};
				setting.addButton((button) => {
					button
						.setButtonText(translate('startSync'))
						.setCta()
						.onClick(() => {
							if (isIdle()) requestSync('manual');
						});
					// Greyed out while a sync runs, so the button matches the ribbon icon.
					unsubscribe = isIdle.subscribe((idle) => button.setDisabled(!idle), {
						immediate: true,
					});
				});
				return () => {
					unsubscribe();
					off();
				};
			},
			search: false,
		})),
		20: s(() => ({
			desc: translate('backendDescription'),
			labels: [matchLabel()],
			name: translate('backend'),
			render: (setting) => {
				const checks = addCheckConnection(setting, ctx);
				setting.addDropdown((dropdown) => {
					for (const [key, { prettyName }] of remoteFsRegistry)
						dropdown.addOption(key, prettyName());
					dropdown.setValue(settings.remoteFs).onChange((value) => {
						settings.remoteFs = value;
						void checks.check();
						void saveSettings();
					});
				});
				return checks.cleanup;
			},
			// With a single backend there is nothing to choose; its module shows the
			// connection check instead.
			visible: () => remoteFsRegistry.size > 1,
		})),
		50: s(() => ({
			control: {
				key: 'decider',
				options: Object.fromEntries(
					[...deciderRegistry].map(([key, { prettyName }]) => [key, prettyName()]),
				),
				type: 'dropdown',
			},
			desc: translate('syncStrategyDescription'),
			name: translate('syncStrategy'),
		})),
		60: s(() => ({
			control: {
				key: 'conflictResolver',
				options: Object.fromEntries(
					[...conflictResolverRegistry].map(([key, { prettyName }]) => [
						key,
						prettyName(),
					]),
				),
				type: 'dropdown',
			},
			desc: translate('conflictResolveStrategyDescription'),
			name: translate('conflictResolveStrategy'),
		})),
	};
}

const RESULT_KEYS = {
	cancelled: 'cancelled',
	completed: 'completed',
	failed: 'failed',
	noop: 'completedNoop',
} as const;

export function describeLastSync(
	lastSync: LastSync | undefined,
	translate: Translate<HeadSettingTranslations>,
) {
	if (!lastSync) return translate('lastSyncNever');
	const text = translate('lastSyncValue', {
		result: translate(RESULT_KEYS[lastSync.result]),
		time: formatDateTime(lastSync.at),
	});
	return lastSync.error ? `${text}: ${lastSync.error}` : text;
}
