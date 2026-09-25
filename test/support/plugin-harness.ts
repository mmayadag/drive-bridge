// Loads the plugin from src/ the way Obsidian does, against a fake app, and records what it
// registers (commands, ribbon icons, status bar items, setting tabs) and what it saves.
// Needs the preload (jsdom and the obsidian mock) and a global indexedDB (fake-indexeddb).

import type { Command, EventRef } from 'obsidian';

type RibbonIcon = {
	callback: (evt: MouseEvent) => void;
	el: HTMLElement;
	icon: string;
	title: string;
};

export type FakeApp = ReturnType<typeof fakeApp>;

/** An app with the vault, workspace and secret storage the plugin touches, all in memory. */
export function fakeApp(options: { vaultName?: string } = {}) {
	const secrets = new Map<string, string>();
	const folders = new Set<string>();
	const files = new Map<string, string>();
	const opened: Array<unknown> = [];
	const events: Array<{ name: string; target: 'vault' | 'workspace' }> = [];
	const layoutReady: Array<() => void> = [];
	const on = (target: 'vault' | 'workspace') => (name: string) => {
		events.push({ name, target });
		return { name } as unknown as EventRef;
	};
	const app = {
		metadataCache: { on: () => ({}) },
		secretStorage: {
			deleteSecret: (key: string) => void secrets.delete(key),
			getSecret: (key: string) => secrets.get(key),
			listSecrets: () => [...secrets.keys()],
			setSecret: (key: string, value: string) => void secrets.set(key, value),
		},
		vault: {
			adapter: {
				exists: (path: string) => Promise.resolve(folders.has(path) || files.has(path)),
				mkdir: (path: string) => Promise.resolve(void folders.add(path)),
			},
			configDir: '.obsidian',
			create: (path: string, data: string) => {
				if (files.has(path))
					return Promise.reject(new Error(`File already exists: ${path}`));
				files.set(path, data);
				return Promise.resolve({ path });
			},
			getName: () => options.vaultName ?? 'vault',
			on: on('vault'),
		},
		workspace: {
			getActiveFile: () => {},
			getLeaf: () => ({
				openFile: (file: unknown) => Promise.resolve(void opened.push(file)),
			}),
			getMostRecentLeaf: () => {},
			on: on('workspace'),
			onLayoutReady: (callback: () => void) => void layoutReady.push(callback),
		},
	};
	return { app, events, files, folders, layoutReady, opened, secrets };
}

/** Builds the plugin on a fake app and records what it hands to Obsidian. */
export async function createPlugin(
	options: { data?: Record<string, unknown>; vaultName?: string } = {},
) {
	const { default: Plugin } = await import('@');
	const fake = fakeApp(options);
	const plugin = new Plugin(fake.app as never, {} as never);
	const commands: Array<Command> = [];
	const ribbonIcons: Array<RibbonIcon> = [];
	const statusBarItems: Array<HTMLElement> = [];
	const settingTabs: Array<unknown> = [];
	const registeredEvents: Array<EventRef> = [];
	const saved: Array<unknown> = [];
	Object.assign(plugin, {
		addCommand: (command: Command) => {
			commands.push(command);
			return command;
		},
		addRibbonIcon: (icon: string, title: string, callback: (evt: MouseEvent) => void) => {
			const el = createDiv();
			el.createSvg('svg');
			ribbonIcons.push({ callback, el, icon, title });
			return el;
		},
		addSettingTab: (tab: unknown) => void settingTabs.push(tab),
		addStatusBarItem: () => {
			const el = createDiv();
			statusBarItems.push(el);
			return el;
		},
		loadData: () => Promise.resolve(structuredClone(options.data ?? {})),
		registerEvent: (ref: EventRef) => void registeredEvents.push(ref),
		saveData: (data: unknown) => Promise.resolve(void saved.push(structuredClone(data))),
	});
	return {
		...fake,
		commands,
		plugin,
		registeredEvents,
		ribbonIcons,
		saved,
		settingTabs,
		statusBarItems,
	};
}

/** Lets pending promises (saves, module start-up) settle. */
export function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}
