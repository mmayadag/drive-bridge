import type { Context, Events } from '@';
import Gdrive from '@/gdrive';
import SmartMerge from '@/smart-merge';
import type { Dispatch } from './event-bus';

export type ModuleInstance = {
	moduleSettings: object;
	/** Resets the module's settings that Reset to defaults may change. */
	resetSettings?: () => void;
	/** Secrets a settings export may carry, sealed with a passphrase. */
	secrets?: {
		export: () => Record<string, string>;
		/** Stores imported secrets; returns a line for the import notice. */
		import: (values: Record<string, string>) => Promise<string | undefined>;
	};
	dispose?: () => void;
	start?: () => void;
};
export type ModuleCtor = new (ctx: object) => ModuleInstance;

// Every module ships inside main.js. Nothing is downloaded or evaluated at runtime.
const BUNDLED_MODULES: Record<string, ModuleCtor> = {
	gdrive: Gdrive as ModuleCtor,
	'smart-merge': SmartMerge as ModuleCtor,
};

export default class BundledModules {
	private readonly loadedModules = new Map<string, ModuleCtor>();

	declare readonly settings: {
		modules: Record<string, object>;
	};
	declare readonly events: {
		moduleLoaded: string;
	};

	constructor(
		private readonly ctx: {
			__addModule__: Context['__addModule__'];
			__getModule__: Context['__getModule__'];
			dispatch: Dispatch<Events>;
			allModules: Set<unknown>;
			saveSettings: () => Promise<void>;
		},
	) {}

	private readonly loadAllModules = () => {
		const { __addModule__, __getModule__, allModules, dispatch, saveSettings } = this.ctx;
		const { modules } = this.settings;
		for (const [id, ctor] of Object.entries(BUNDLED_MODULES)) {
			__addModule__(ctor as never);
			const instance: ModuleInstance = __getModule__(ctor as never);
			const saved = modules[id];
			if (saved) Object.assign(instance.moduleSettings, saved);
			modules[id] = instance.moduleSettings;
			allModules.add(ctor);
			this.loadedModules.set(id, ctor);
			dispatch('moduleLoaded', id);
		}
		void saveSettings();
	};

	private readonly resetModuleSettings = () => {
		for (const ctor of this.loadedModules.values())
			(this.ctx.__getModule__(ctor as never) as ModuleInstance).resetSettings?.();
	};

	private readonly instances = () =>
		[...this.loadedModules].map(
			([id, ctor]) => [id, this.ctx.__getModule__(ctor as never) as ModuleInstance] as const,
		);

	private readonly exportModuleSecrets = () => {
		const secrets: Record<string, Record<string, string>> = {};
		for (const [id, instance] of this.instances())
			if (instance.secrets) secrets[id] = instance.secrets.export();
		return secrets;
	};

	private readonly importModuleSecrets = async (
		secrets: Record<string, Record<string, string>>,
	) => {
		const lines: Array<string> = [];
		for (const [id, instance] of this.instances()) {
			const values = secrets[id];
			if (!values || !instance.secrets) continue;
			const line = await instance.secrets.import(values);
			if (line) lines.push(line);
		}
		return lines;
	};

	readonly dispose = () => this.loadedModules.clear();

	readonly root = {
		exportModuleSecrets: this.exportModuleSecrets,
		importModuleSecrets: this.importModuleSecrets,
		loadAllModules: this.loadAllModules,
		loadedModules: this.loadedModules,
		resetModuleSettings: this.resetModuleSettings,
	};
}
