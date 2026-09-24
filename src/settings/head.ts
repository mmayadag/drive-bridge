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
import type { ErrorTranslations } from '@/utils/describe-error';
import { describeError } from '@/utils/describe-error';
import formatDateTime from '@/utils/format-date';
import type { CheckConnectionDB } from './check-connection';
import type { AugmentedSettingDefinitionItem, LabelDefinition } from './utils';
import { addCheckConnection } from './check-connection';
import { CONFLICTS, SYNC_STRATEGY } from './layout';
import { choiceRows } from './strategy';
import { addLabel, s } from './utils';

export type HeadSettingTranslations = {
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
	lastSync: string;
	lastSyncNever: string;
	lastSyncValue: Snippet<{ time: string; result: string }>;
	filesSkipped: Snippet<number>;
	completed: string;
	completedNoop: string;
	cancelled: string;
	failed: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
	checkConnection: string;
	conflictResolveStrategy: string;
	conflictResolveStrategyDescription: string;
	neverDeleteRemote: string;
	neverDeleteRemoteDescription: string;
	forRepairs: string;
	nothingLost: string;
	replacesOneVersion: string;
	startSync: string;
};

export default function headSettings(
	ctx: {
		translate: Translate<HeadSettingTranslations & ErrorTranslations>;
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
		rerenderSettingTab: () => void;
		refreshSettingTab: () => void;
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
		rerenderSettingTab,
		refreshSettingTab,
	} = ctx;
	const choose = (key: 'decider' | 'conflictResolver', value: string) => {
		settings[key] = value;
		void saveSettings();
		// Updates the entry's value and warning, and rows that depend on the choice.
		rerenderSettingTab();
		refreshSettingTab();
	};
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
					// The sentence replaces the raw error; keep the original one step away.
					setting.descEl.setAttr('title', lastSync?.error ?? '');
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
		[SYNC_STRATEGY]: s(() => {
			const entries = [...deciderRegistry].map(([key, entry]) => ({ entry, key }));
			const choices = (repair: boolean) =>
				choiceRows(
					entries
						.filter(({ entry }) => Boolean(entry.repair) === repair)
						.map(({ entry, key }) => ({
							description: entry.description?.(),
							flow: entry.flow,
							key,
							name: entry.prettyName(),
							order: entry.order,
						})),
					() => settings.decider,
					(key) => choose('decider', key),
				);
			return {
				desc: warningOr(
					deciderRegistry.get(settings.decider),
					translate('syncStrategyDescription'),
				),
				displayValue: () => deciderRegistry.get(settings.decider)?.prettyName() ?? '',
				items: [
					{ items: choices(false), type: 'group' },
					{ heading: translate('forRepairs'), items: choices(true), type: 'group' },
				],
				name: translate('syncStrategy'),
				// oxlint-disable-next-line unicorn/no-null -- Obsidian's status type has no undefined
				status: () => (deciderRegistry.get(settings.decider)?.repair ? 'warning' : null),
				type: 'page',
			};
		}),
		[CONFLICTS]: s((self) => {
			const entries = [...conflictResolverRegistry].map(([key, entry]) => ({ entry, key }));
			const choices = (lossy: boolean) =>
				choiceRows(
					entries
						.filter(({ entry }) => Boolean(entry.lossy) === lossy)
						.map(({ entry, key }) => ({
							description: entry.description?.(),
							example: entry.example?.(),
							key,
							name: entry.prettyName(),
							order: entry.order,
						})),
					() => settings.conflictResolver,
					(key) => choose('conflictResolver', key),
				);
			return {
				desc: warningOr(
					conflictResolverRegistry.get(settings.conflictResolver),
					translate('conflictResolveStrategyDescription'),
				),
				displayValue: () =>
					conflictResolverRegistry.get(settings.conflictResolver)?.prettyName() ?? '',
				items: [
					{
						heading: translate('nothingLost'),
						// Modules add their options' extra rows here, such as Smart merge's markers.
						items: [
							...choices(false),
							...Object.values(self).map((node) => node(node)),
						],
						type: 'group',
					},
					{
						heading: translate('replacesOneVersion'),
						items: choices(true),
						type: 'group',
					},
				] as never,
				name: translate('conflictResolveStrategy'),
				status: () => {
					const lossy = conflictResolverRegistry.get(settings.conflictResolver)?.lossy;
					// oxlint-disable-next-line unicorn/no-null -- Obsidian's status type has no undefined
					return lossy ? 'warning' : null;
				},
				type: 'page',
			};
		}),
		// A safety switch, so it sits with the strategies rather than under Advanced.
		[CONFLICTS + 5]: s(() => ({
			control: { key: 'neverDeleteRemote', type: 'toggle' },
			desc: translate('neverDeleteRemoteDescription'),
			name: translate('neverDeleteRemote'),
		})),
	};
}

/** The selected strategy's warning in the warning colour, or the usual description. */
function warningOr(entry: { warning?: () => string } | undefined, description: string) {
	const warning = entry?.warning?.();
	if (!warning) return description;
	return createFragment((frag) =>
		frag.createSpan({ cls: 'drive-bridge-warning-text', text: warning }),
	);
}

const RESULT_KEYS = {
	cancelled: 'cancelled',
	completed: 'completed',
	failed: 'failed',
	noop: 'completedNoop',
} as const;

export function describeLastSync(
	lastSync: LastSync | undefined,
	translate: Translate<HeadSettingTranslations & ErrorTranslations>,
) {
	if (!lastSync) return translate('lastSyncNever');
	const text = translate('lastSyncValue', {
		result: translate(RESULT_KEYS[lastSync.result]),
		time: formatDateTime(lastSync.at),
	});
	const described = lastSync.error
		? `${text}: ${describeError(lastSync.error, translate)}`
		: text;
	return lastSync.skipped
		? `${described} · ${translate('filesSkipped', lastSync.skipped)}`
		: described;
}
