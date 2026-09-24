import type { Context, SelectFromContext, Settings, Translations } from '@';
import type { App } from 'obsidian';
import type { Translate, TranslationResource } from '@/modules/i18n';
import type {
	FsWrapperEntry,
	RemoteFsEntry,
	RemoteRequestMiddlewareEntry,
} from '@/modules/registrar';
import type { SettingEntry } from '@/modules/setting';
import digOriginal from '@/fs/dig-original';
import prefixWrapper from '@/fs/wrappers/prefix';
import type { RemoteScan, SnapshotDB } from './changes';
import type { GdriveDB } from './fs';
import type { GdriveTranslations } from './setting';
import { TokenManager, bearerMiddleware } from './auth';
import checkConnection from './check-connection';
import { connectWithToken } from './connect';
import GdriveFs from './fs';
import en from './i18n';
import gdriveSetting from './setting';

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

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & GdriveTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			memoryDB: GdriveDB;
			indexedDB: SnapshotDB;
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
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerSetting,
		} = this.ctx;
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection,
				instantiate: (request) =>
					new GdriveFs(request, this.moduleSettings, memoryDB, indexedDB),
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
				apply: gdriveSetting(this.ctx as Context, this.moduleSettings, this.tokenManager),
				priority: 683,
			}),
		);
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
