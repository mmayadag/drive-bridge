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
import type { GdriveDB } from './fs';
import type { GdriveTranslations } from './setting';
import { TokenManager, bearerMiddleware } from './auth';
import checkConnection from './check-connection';
import GdriveFs from './fs';
import en from './i18n';
import gdriveSetting from './setting';

export type GdriveSettings = {
	accountEmail: string;
	baseDirectory: string;
	clientId: string;
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

	readonly moduleSettings: GdriveSettings = {
		accountEmail: '',
		baseDirectory: '',
		clientId: '',
		useTrash: true,
		userId: '',
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			memoryDB,
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerSetting,
		} = this.ctx;
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection,
				instantiate: (request) => new GdriveFs(request, this.moduleSettings, memoryDB),
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
