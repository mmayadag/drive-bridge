import type { App, Command, EventRef, ItemView, Menu, TAbstractFile, View } from 'obsidian';
import { Notice, TFile } from 'obsidian';
import type { Ref } from '@/shared/reactive';
import type { Translate } from './i18n';
import type { SyncOptions, SyncTerminateReason } from './sync';

export type SyncThisFileTranslations = { syncThisFile: string; fileSynced: string };

/** Sync this file: command, note header button and file menu item, for the active note. */
export function registerSyncThisFile(ctx: {
	app: App;
	addCommand: (command: Command) => Command;
	registerEvent: (ref: EventRef) => void;
	isIdle: Ref<boolean>;
	translate: Translate<SyncThisFileTranslations>;
	executeSync: (trigger: string, options?: SyncOptions) => Promise<SyncTerminateReason>;
}) {
	const { app, translate: t, isIdle } = ctx;
	const sync = async (file: TFile) => {
		if (!isIdle()) return;
		const result = await ctx.executeSync('file', { only: file.path });
		if (result.result === 'completed' || result.result === 'noop')
			new Notice(`${t('fileSynced')} ${file.path}`);
	};

	ctx.addCommand({
		checkCallback: (checking: boolean) => {
			const file = app.workspace.getActiveFile();
			if (!file || !isIdle()) return false;
			if (!checking) void sync(file);
			return true;
		},
		icon: 'refresh-cw',
		id: 'sync-this-file',
		name: t('syncThisFile'),
	});

	ctx.registerEvent(
		app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			menu.addItem((item) =>
				item
					.setTitle(t('syncThisFile'))
					.setIcon('refresh-cw')
					.onClick(() => void sync(file)),
			);
		}),
	);

	// One header button per note view; views are reused, so each gets it once.
	const withButton = new WeakSet<View>();
	const addButton = () => {
		const view = app.workspace.getMostRecentLeaf()?.view;
		if (view?.getViewType() !== 'markdown' || withButton.has(view)) return;
		withButton.add(view);
		// Note views are ItemViews, which have header actions.
		(view as ItemView).addAction('refresh-cw', t('syncThisFile'), () => {
			const file = app.workspace.getActiveFile();
			if (file) void sync(file);
		});
	};
	ctx.registerEvent(app.workspace.on('active-leaf-change', addButton));
	app.workspace.onLayoutReady(addButton);
}
