import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

export type ConfirmOptions = {
	title: string;
	message: string;
	confirm: string;
	cancel: string;
	onConfirm: () => unknown;
};

export default class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConfirmOptions,
	) {
		super(app);
	}

	onOpen() {
		const { title, message, confirm, cancel, onConfirm } = this.options;
		this.setTitle(title);
		this.contentEl.createEl('p', { text: message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(cancel).onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(confirm)
					.setDestructive()
					.onClick(() => {
						this.close();
						void onConfirm();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
