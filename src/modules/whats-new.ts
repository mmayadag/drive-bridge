import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { Fragment, Translate } from './i18n';
import { VERSION } from './event-bus';

export type WhatsNewTranslations = {
	whatsNew: string;
	updatedTo: Fragment<{ version: string; url: string }>;
};

// Per vault and device, never synced: each device notes its own update once.
const SHOWN_KEY = 'drive-bridge-last-version';

/** This version's release notes on GitHub. Opened by the user in the browser, never fetched. */
export function releaseNotesUrl(version = VERSION) {
	return `https://github.com/mmayadag/drive-bridge/releases/tag/${version}`;
}

/**
 * Once after an update: a notice linking to what changed. A fresh install shows nothing,
 * and the plugin never checks for new versions itself; Obsidian and BRAT do.
 */
export function noteUpdate(ctx: { app: App; translate: Translate<WhatsNewTranslations> }) {
	const { app, translate } = ctx;
	const shown = app.loadLocalStorage(SHOWN_KEY);
	if (shown === VERSION) return;
	app.saveLocalStorage(SHOWN_KEY, VERSION);
	if (typeof shown !== 'string') return;
	new Notice(translate('updatedTo', { url: releaseNotesUrl(), version: VERSION }), 15_000);
}
