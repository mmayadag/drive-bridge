import type { Context, Events } from '@';
import type { General } from '@/types';
import type { Dispatch } from './EventBus';
import Gdrive from '../../../gdrive/src';
import SmartMerge from '../../../smart-merge/src';

export type ModuleInstance = {
	moduleSettings: object;
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
			allModules: Set<General>;
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

	readonly dispose = () => this.loadedModules.clear();

	readonly root = {
		loadAllModules: this.loadAllModules,
		loadedModules: this.loadedModules,
	};
}
