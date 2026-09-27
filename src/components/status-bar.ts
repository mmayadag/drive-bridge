import type { App } from 'obsidian';
import { setIcon, setTooltip } from 'obsidian';
import type { Ref } from '@/shared/reactive';

type SettingsWindow = { open?: () => void; openTabById?: (id: string) => unknown };

/**
 * Opens a plugin's settings. Obsidian has no public call for it; `app.setting` is what
 * plugins use. Returns false when it is missing or fails, so the caller can do something
 * else instead.
 */
export function openPluginSettings(app: App, pluginId: string) {
	const setting = (app as { setting?: SettingsWindow }).setting;
	try {
		if (!setting?.open || !setting.openTabById) return false;
		setting.open();
		setting.openTabById(pluginId);
		return true;
	} catch {
		return false;
	}
}

/**
 * The status bar item: an icon that spins while syncing, the status text (optional), the
 * whole status as a tooltip, and a click action. Returns a cleanup.
 */
export function mountStatusBar(
	statusEl: HTMLElement,
	options: {
		text: Ref<string>;
		/** Shown while there is no status yet. */
		idleText: string;
		idle: Ref<boolean>;
		showText: boolean;
		onClick: () => void;
	},
) {
	statusEl.addClass('mod-clickable', 'drive-bridge-status');
	setIcon(statusEl, 'refresh-cw');
	const icon = statusEl.firstElementChild;
	const status = statusEl.createSpan({ cls: 'drive-bridge-status-text' });
	const showText = (shown: boolean) => (shown ? status.show() : status.hide());
	showText(options.showText);
	statusEl.addEventListener('click', options.onClick);
	const cleanups = [
		options.idle.subscribe((idle) => icon?.toggleClass('drive-bridge-spin', !idle), {
			immediate: true,
		}),
		options.text.subscribe(
			(text) => {
				const shown = text || options.idleText;
				status.setText(shown);
				// The whole status on hover, so the icon alone still says it.
				setTooltip(statusEl, `Drive Bridge · ${shown}`, { placement: 'top' });
			},
			{ immediate: true },
		),
		() => statusEl.removeEventListener('click', options.onClick),
	];
	return { cleanup: () => cleanups.forEach((fn) => fn()), showText };
}
