import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { BaseTask } from '@/sync';
import type { FileTreeTranslations } from './file-tree';
import mountFileTree from './file-tree';

/** What a sync would do now, read-only: nothing has been changed. */
export default class PreviewModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			title: string;
			description: string;
			done: string;
			tasks: Array<BaseTask>;
			translate: Translate<FileTreeTranslations>;
		},
	) {
		super(app);
	}

	onOpen() {
		const { title, description, done, tasks, translate } = this.options;
		this.setTitle(title);
		const container = this.contentEl.createDiv('drive-bridge-progress-modal');
		container.createEl('p', { cls: 'drive-bridge-progress-description', text: description });
		if (tasks.length) {
			const details = container.createDiv('drive-bridge-progress-details');
			mountFileTree(details, tasks, translate, { readOnly: true });
		}
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(done)
				.setCta()
				.onClick(() => this.close()),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
