import type { SelectFromContext } from '@';
import type { Fs } from '@/fs/interface';
import type { TranslationResource, Translate } from '@/modules/i18n';
import type { ConflictResolverEntry, FsWrapperEntry } from '@/modules/registrar';
import type { SettingEntry } from '@/modules/setting';
import type { DatabaseAsync, StoreAsync } from '@/shared/key-value-store';
import type { SmartMergeTranslations } from './i18n';
import type { SmartMergeSettings } from './setting';
import en from './i18n';
import smartMergeResolver from './resolver';
import smartMergeSetting from './setting';
import smartMergeBaseTextWrapper from './wrapper';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

export type SmartMergeDatabase = DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>;
export type BaseTextStore = StoreAsync<string>;

const RESOLVER_ID = 'smartMerge';
const DEFAULT_MARKERS: SmartMergeSettings = {
	conflictAEnd: '</mark>',
	conflictAStart: '<mark class="conflict ours">',
	conflictBEnd: '</mark>',
	conflictBStart: '<mark class="conflict theirs">',
	deletionEnd: '</mark>',
	deletionStart: '<mark class="conflict deleted">',
};

export default class SmartMerge {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			indexedDB: SmartMergeDatabase;
			translate: Translate<SmartMergeTranslations>;
			saveSettings: () => Promise<void>;
			getNamespace: (localFs?: Fs, remoteFs?: Fs) => string;
			registerTranslations: (resource: TranslationResource) => void;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerConflictResolver: (id: string, entry: ConflictResolverEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
		}>,
	) {
		ctx.registerTranslations(en);
	}

	// Reads the core setting so base texts are only captured when they can be used.
	declare readonly settings: { conflictResolver: string };

	readonly moduleSettings: SmartMergeSettings = { ...DEFAULT_MARKERS };

	readonly resetSettings = () => Object.assign(this.moduleSettings, DEFAULT_MARKERS);

	readonly start = () => {
		const {
			indexedDB,
			getNamespace,
			registerConflictResolver,
			registerRemoteFsWrapper,
			registerSetting,
			saveSettings,
			translate,
		} = this.ctx;
		this.cleanup.push(
			registerRemoteFsWrapper({
				// Storing a copy of every synced text file is only worth it while
				// Smart merge is the chosen conflict strategy.
				apply: (fs) => {
					if (this.settings.conflictResolver !== RESOLVER_ID) return;
					return smartMergeBaseTextWrapper(
						fs,
						indexedDB.getStore(`base-text-${getNamespace(undefined, fs)}`),
					);
				},
				priority: 20_098,
			}),
			registerConflictResolver(RESOLVER_ID, {
				description: () => translate('smartMergeDescription'),
				order: 20,
				prettyName: () => translate('smartMerge'),
				resolver: smartMergeResolver(this.moduleSettings, indexedDB, getNamespace),
			}),
			registerSetting({
				apply: smartMergeSetting(
					{
						isSelected: () => this.settings.conflictResolver === RESOLVER_ID,
						saveSettings,
						translate,
					},
					this.moduleSettings,
				),
				priority: 4048,
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
