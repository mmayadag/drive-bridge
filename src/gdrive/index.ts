import type { Context, Events, SelectFromContext, Settings, Translations } from '@';
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { Dispatch } from '@/modules/event-bus';
import type { Translate, TranslationResource } from '@/modules/i18n';
import type {
	FsWrapperEntry,
	RemoteFsEntry,
	RemoteRequestMiddlewareEntry,
	Request,
} from '@/modules/registrar';
import type { SettingEntry } from '@/modules/setting';
import digOriginal from '@/fs/dig-original';
import prefixWrapper from '@/fs/wrappers/prefix';
import { getMessage } from '@/shared/error';
import { normalizeBaseDir } from '@/shared/path';
import type { RemoteScan, SnapshotDB } from './changes';
import type { GdriveDB } from './fs';
import type { Quota } from './quota';
import type { SecretIds } from './secret-scope';
import type { GdriveTranslations } from './translations';
import { TokenManager, bearerMiddleware } from './auth';
import checkConnection from './check-connection';
import { connectWithToken } from './connect';
import GdriveFs from './fs';
import en from './i18n';
import { QUOTA_CHECK_INTERVAL, fetchQuota, formatBytes, isNearlyFull } from './quota';
import { adoptLegacySecrets, secretIds, secretScope } from './secret-scope';
import gdriveSetting from './setting';

const QUOTA_CHECKED_KEY = 'drive-bridge-quota-checked';

export type GdriveSettings = {
	accountEmail: string;
	baseDirectory: string;
	clientId: string;
	remoteScan: RemoteScan;
	useTrash: boolean;
	userId: string;
};

/** What Reset to defaults puts back; everything else ties the device to its Drive. */
const PREFERENCES: Pick<GdriveSettings, 'remoteScan' | 'useTrash'> = {
	remoteScan: 'changes',
	useTrash: true,
};

export default class Gdrive {
	private readonly cleanup: Array<() => void> = [];
	private readonly tokenManager: TokenManager;
	private readonly secretIds: SecretIds;
	/** The last storage quota Drive reported, for the Connection row. */
	private quota?: Quota;

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & GdriveTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			memoryDB: GdriveDB;
			indexedDB: SnapshotDB;
			dispatch: Dispatch<Events>;
			getRequest: () => Request;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerTranslations: (resource: TranslationResource) => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerTranslations(en);
		this.secretIds = secretIds(secretScope(ctx.app));
		this.tokenManager = new TokenManager(
			ctx.app.secretStorage,
			() => this.moduleSettings.clientId,
			ctx.translate,
			{ getUserId: () => this.moduleSettings.userId, ids: this.secretIds },
		);
	}

	readonly secrets = {
		export: () => {
			const { clientSecret } = this.tokenManager.getCredentials();
			const refreshToken = this.tokenManager.getRefreshToken() ?? '';
			return Object.fromEntries(
				Object.entries({ clientSecret, refreshToken }).filter(([, value]) => value),
			);
		},
		// The token is verified like a pasted one before it replaces the current account.
		import: async ({ clientSecret, refreshToken }: Record<string, string>) => {
			if (clientSecret) this.tokenManager.setClientSecret(clientSecret);
			if (!refreshToken) return;
			const result = await connectWithToken(this.tokenManager, refreshToken);
			const { translate } = this.ctx;
			if (result.status !== 'connected')
				return translate(
					'authorizationFailed',
					result.status === 'failed' ? result.reason : translate('invalidRefreshToken'),
				);
			this.moduleSettings.userId = result.account.userId;
			this.moduleSettings.accountEmail = result.account.email;
			return translate('accountConnectedDescription', result.account.email);
		},
	};

	// The account, client and folder are kept: they are what ties this device to its Drive.
	readonly resetSettings = () => Object.assign(this.moduleSettings, PREFERENCES);

	// Only the preferences can be left out of an export: the account, client and folder
	// always travel, and the folder's default comes from the vault name, which differs
	// between devices.
	readonly transferDefaults = PREFERENCES;

	readonly moduleSettings: GdriveSettings = {
		accountEmail: '',
		baseDirectory: '',
		clientId: '',
		userId: '',
		...PREFERENCES,
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			memoryDB,
			indexedDB,
			dispatch,
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerSetting,
		} = this.ctx;
		// Saved settings are applied after the constructor, so whether this vault was
		// connected is only known here.
		adoptLegacySecrets(
			this.ctx.app.secretStorage,
			this.secretIds,
			Boolean(this.moduleSettings.userId),
		);
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection,
				destination: () => {
					const { accountEmail, baseDirectory } = this.moduleSettings;
					if (accountEmail) return `${accountEmail} · ${baseDirectory}`;
				},
				instantiate: (request) =>
					new GdriveFs(request, this.moduleSettings, memoryDB, {
						log: (line) => dispatch('logSync', line),
						persistentDB: indexedDB,
						rootKey: normalizeBaseDir(this.moduleSettings.baseDirectory),
					}),
				prettyName: () => translate('gdrive'),
			}),
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (digOriginal(fs) instanceof GdriveFs)
						return prefixWrapper(fs, this.moduleSettings.baseDirectory);
				},
				priority: 5998,
			}),
			registerRemoteRequestMiddleware({
				apply: (request) => {
					if (this.settings.remoteFs !== 'gdrive') return;
					return bearerMiddleware(request, this.tokenManager);
				},
				priority: 305,
			}),
			registerSetting({
				apply: gdriveSetting(
					this.ctx as Context,
					this.moduleSettings,
					this.tokenManager,
					() => this.quota,
				),
				priority: 683,
			}),
		);
		this.ctx.app.workspace.onLayoutReady(() => void this.checkQuota());
	};

	/**
	 * Once a day on each device: warns when Drive is nearly full, so uploads do not start
	 * failing without a word. Any failure is only logged.
	 */
	private readonly checkQuota = async (now = Date.now()) => {
		const { app, dispatch, getRequest, translate } = this.ctx;
		if (this.settings.remoteFs !== 'gdrive' || !this.tokenManager.getRefreshToken()) return;
		const last = Number(app.loadLocalStorage(QUOTA_CHECKED_KEY) ?? 0);
		if (now - last < QUOTA_CHECK_INTERVAL && now >= last) return;
		app.saveLocalStorage(QUOTA_CHECKED_KEY, String(now));
		try {
			this.quota = await fetchQuota(getRequest());
		} catch (error) {
			dispatch('logGeneral', `Drive quota check failed: \`${getMessage(error)}\`.`);
			return;
		}
		if (!this.quota || !isNearlyFull(this.quota)) return;
		const sizes = {
			limit: formatBytes(this.quota.limit ?? 0),
			used: formatBytes(this.quota.used),
		};
		new Notice(translate('driveAlmostFull', sizes), 15_000);
		dispatch('logGeneral', `Google Drive is nearly full: ${sizes.used} of ${sizes.limit}.`);
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
