import type { App } from 'obsidian';
import { Modal, Setting, setIcon } from 'obsidian';

export type HelpItem = { icon: string; name: string; desc: string; run: () => void };

/**
 * Makes a setting row a help item: its icon in front, and the whole row runs it. Returns
 * a cleanup, since Obsidian may reuse the row when the settings tab re-renders.
 */
export function asHelpRow(settingEl: HTMLElement, { icon, run }: HelpItem, before = () => {}) {
	const iconEl = createDiv({ cls: 'drive-bridge-help-icon' });
	setIcon(iconEl, icon);
	settingEl.prepend(iconEl);
	settingEl.addClass('drive-bridge-help-item');
	settingEl.setAttr('role', 'button');
	settingEl.setAttr('tabindex', '0');
	const choose = () => {
		before();
		run();
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			choose();
		}
	};
	settingEl.addEventListener('click', choose);
	settingEl.addEventListener('keydown', onKey);
	return () => {
		iconEl.remove();
		settingEl.removeEventListener('click', choose);
		settingEl.removeEventListener('keydown', onKey);
	};
}

/** The help items one per row, icon and label, each doing what its icon does. */
export class HelpListModal extends Modal {
	constructor(
		app: App,
		private readonly options: { title: string; items: Array<HelpItem> },
	) {
		super(app);
	}

	onOpen() {
		const { title, items } = this.options;
		this.setTitle(title);
		for (const item of items) {
			const row = new Setting(this.contentEl).setName(item.name).setDesc(item.desc);
			asHelpRow(row.settingEl, item, () => this.close());
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
