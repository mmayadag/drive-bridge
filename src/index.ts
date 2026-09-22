import type { Command, EventRef, App } from 'obsidian';
import { Plugin } from 'obsidian';
import type { AddRibbonIcon } from '@/modules/observability';
import type { Context as KernelContext, MergeSingleKey } from '@/shared/module-context';
import Bootstrap from '@/modules/bootstrap';
import BundledModules from '@/modules/bundled-modules';
import EventBus from '@/modules/event-bus';
import I18n from '@/modules/i18n';
import Observability from '@/modules/observability';
import ProgressModal from '@/modules/progress-modal';
import Registrar from '@/modules/registrar';
import Scheduler from '@/modules/scheduler';
import Setting from '@/modules/setting';
import Storage from '@/modules/storage';
import Sync from '@/modules/sync';
import { createContext } from '@/shared/module-context';

const internalModules = [
	EventBus,
	I18n,
	Storage,
	BundledModules,
	Setting,
	Registrar,
	Sync,
	Observability,
	Scheduler,
	ProgressModal,
	Bootstrap,
] as const;

type InternalModules = typeof internalModules;
export type MergeKeys = 'settings' | 'root' | 'events' | 'i18n';
export type Context = KernelContext<
	InternalModules,
	MergeKeys,
	{
		app: App;
		addCommand: (command: Command) => Command;
		registerEvent: (ref: EventRef) => void;
		addRibbonIcon: AddRibbonIcon;
		addStatusBarItem: () => HTMLElement;
		saveSettings: () => Promise<void>;
	}
>;
export type Events = MergeSingleKey<InternalModules, 'events'>;
export type Settings = MergeSingleKey<InternalModules, 'settings'>;
export type Translations = MergeSingleKey<InternalModules, 'i18n'>;
/** Lets a module declare the slice of the context it needs, checked against the real context. */
export type SelectFromContext<O extends object> = Context extends O ? O : never;

export default class DriveBridge extends Plugin {
	context?: Context;
	readonly allModules = new Set(internalModules);
	declare settings: Settings;

	async onload() {
		const settings: Settings = {
			avoidAutoSyncWhenOffline: true,
			confirmDeleteInAutoSync: true,
			confirmTasksInSync: true,
			conflictResolver: 'renameAndKeepBoth',
			customHeaders: [],
			decider: 'bidirectional',
			exclusionRules: [
				'.git',
				'.github',
				'.gitlab',
				'.svn',
				'node_modules',
				'.DS_Store',
				'__MACOSX',
				'desktop.ini',
				'Thumbs.db',
				'~$*.doc',
				'~$*.docx',
				'~$*.ppt',
				'~$*.pptx',
				'~$*.xls',
				'~$*.xlsx',
				'.trash',
				this.app.vault.configDir,
			].map((expr) => ({ caseSensitive: false, expr })),
			exportLogsDirectory: 'Drive Bridge Logs/',
			inclusionRules: [],
			maxFileSize: { enabled: false, value: 31_457_280 },
			maxMemoryConsumption: { enabled: true, value: 100 * 1024 ** 2 },
			maxRequestConcurrency: { enabled: true, value: 50 },
			minRequestInterval: { enabled: false, value: 0 },
			modules: {},
			noticeStatusOnMobile: true,
			realtimeSync: { enabled: false, value: 5000 },
			realtimeSyncFastMode: true,
			remoteFs: '',
			scheduledSync: { enabled: true, value: 15 * 60 * 1000 },
			startupSync: { enabled: true, value: 5000 },
			...((await this.loadData()) as Record<string, unknown>),
		};
		void this.saveSettings();

		// https://github.com/microsoft/TypeScript/issues/62995
		const preMerge = {
			addCommand: this.addCommand.bind(this),
			addRibbonIcon: this.addRibbonIcon.bind(this),
			addStatusBarItem: this.addStatusBarItem.bind(this),
			allModules: this.allModules,
			app: this.app,
			registerEvent: this.registerEvent.bind(this),
			saveSettings: this.saveSettings,
		};
		this.context = createContext(internalModules, {
			injectKeys: ['settings', 'i18n'],
			mergeKeys: ['settings', 'root', 'events', 'i18n'],
			preMerge,
		}).__assign__({ settings });
		this.settings = this.context.settings;
		this.context.loadAllModules();
		for (const module of this.allModules) {
			const instance = this.context.__getModule__(module);
			if ('start' in instance) instance.start();
		}
		this.context.addSettingTab(this);
	}

	onunload() {
		if (!this.context) return;
		for (const module of [...this.allModules].reverse()) {
			const instance = this.context.__getModule__(module);
			if ('dispose' in instance) instance.dispose();
		}
		this.context = undefined;
	}

	readonly saveSettings = () => this.saveData(this.settings);
}
