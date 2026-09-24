import type { Settings } from '@';
import type { App, EventRef, Menu, TAbstractFile } from 'obsidian';
import { Notice, TFolder } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { GlobMatchRule } from '@/types';

export type ExcludeMenuTranslations = {
	excludeFromSync: string;
	includeInSync: string;
	excludedFromSync: string;
	includedInSync: string;
	undo: string;
};

/** An exclusion rule for exactly this vault path: anchored, and folder-only for folders. */
export function ruleFor(path: string, folder: boolean): string {
	return `/${path}${folder ? '/' : ''}`;
}

/** Adds the rule, or removes it when it is there; returns the new list and what happened. */
export function toggleExclusion(rules: Array<GlobMatchRule>, expr: string) {
	const excluded = rules.some((rule) => rule.expr === expr);
	return {
		excluded: !excluded,
		rules: excluded
			? rules.filter((rule) => rule.expr !== expr)
			: [...rules, { caseSensitive: true, expr }],
	};
}

/** File menu → Exclude from sync / Include in sync, for files and folders. */
export function registerExcludeMenu(ctx: {
	app: App;
	registerEvent: (ref: EventRef) => void;
	settings: Settings;
	saveSettings: () => Promise<void>;
	rerenderSettingTab: () => void;
	translate: Translate<ExcludeMenuTranslations>;
	memoryDB: { getStore: (name: 'ephemeralEditableLists') => { clear: () => void } };
}) {
	const { app, settings, translate: t } = ctx;
	const apply = (rules: Array<GlobMatchRule>) => {
		settings.exclusionRules = rules;
		// The filter page keeps a working copy of the list; drop it so it shows the change.
		ctx.memoryDB.getStore('ephemeralEditableLists').clear();
		void ctx.saveSettings();
		ctx.rerenderSettingTab();
	};
	ctx.registerEvent(
		app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
			if (!file.path || file.path === '/') return;
			const expr = ruleFor(file.path, file instanceof TFolder);
			const excluded = settings.exclusionRules.some((rule) => rule.expr === expr);
			menu.addItem((item) =>
				item
					.setTitle(t(excluded ? 'includeInSync' : 'excludeFromSync'))
					.setIcon(excluded ? 'cloud' : 'cloud-off')
					.onClick(() => {
						const before = settings.exclusionRules;
						const result = toggleExclusion(before, expr);
						apply(result.rules);
						const notice = new Notice(
							createFragment((frag) => {
								frag.appendText(
									`${t(result.excluded ? 'excludedFromSync' : 'includedInSync')} ${file.path} `,
								);
								frag.createEl('a', { href: '#', text: t('undo') }).addEventListener(
									'click',
									(event) => {
										event.preventDefault();
										apply(before);
										notice.hide();
									},
								);
							}),
							8000,
						);
					}),
			);
		}),
	);
}
