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
import type { RemoteScan, SnapshotDB } from './changes';
import type { GdriveDB } from './fs';
import type { Quota } from './quota';
import type { GdriveTranslations } from './translations';
import { TokenManager, bearerMiddleware } from './auth';
import checkConnection from './check-connection';
import { connectWithToken } from './connect';
import GdriveFs from './fs';
import en from './i18n';
import { QUOTA_CHECK_INTERVAL, fetchQuota, formatBytes, isNearlyFull } from './quota';
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

export default class Gdrive {
	private readonly cleanup: Array<() => void> = [];
	private readonly tokenManager: TokenManager;
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
		this.tokenManager = new TokenManager(
			ctx.app.secretStorage,
			() => this.moduleSettings.clientId,
			ctx.translate,
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
	readonly resetSettings = () => {
		this.moduleSettings.useTrash = true;
		this.moduleSettings.remoteScan = 'full';
	};

	readonly moduleSettings: GdriveSettings = {
		accountEmail: '',
		baseDirectory: '',
		clientId: '',
		remoteScan: 'full',
		useTrash: true,
		userId: '',
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
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection,
				instantiate: (request) =>
					new GdriveFs(request, this.moduleSettings, memoryDB, {
						log: (line) => dispatch('logSync', line),
						persistentDB: indexedDB,
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
