import type { App } from 'obsidian';
import { Modal, Setting, setIcon } from 'obsidian';

export type HelpItem = { icon: string; name: string; desc: string; run: () => void };

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
		for (const { icon, name, desc, run } of items) {
			const row = new Setting(this.contentEl).setName(name).setDesc(desc);
			const iconEl = createDiv({ cls: 'drive-bridge-help-icon' });
			setIcon(iconEl, icon);
			row.settingEl.prepend(iconEl);
			row.settingEl.addClass('drive-bridge-help-item');
			row.settingEl.setAttr('role', 'button');
			row.settingEl.setAttr('tabindex', '0');
			const choose = () => {
				this.close();
				run();
			};
			row.settingEl.addEventListener('click', choose);
			row.settingEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					choose();
				}
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
