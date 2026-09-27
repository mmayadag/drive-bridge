import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { SyncSummary } from '@/sync/history';
import { renderSelectableText } from './selectable-text';

export type HistoryTexts = {
	title: string;
	empty: string;
	describe: (summary: SyncSummary) => { heading: string; detail: string };
	showLog: string;
};

/** Recent syncs on this device, newest first. */
export class HistoryModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			texts: HistoryTexts;
			history: Array<SyncSummary>;
			showLog: () => void;
		},
	) {
		super(app);
	}

	onOpen() {
		const { texts, history, showLog } = this.options;
		this.setTitle(texts.title);
		if (!history.length) this.contentEl.createEl('p', { text: texts.empty });
		for (const summary of history) {
			const { heading, detail } = texts.describe(summary);
			const row = new Setting(this.contentEl).setName(heading).setDesc(detail);
			if (summary.result === 'failed') row.nameEl.addClass('drive-bridge-warning-text');
		}
		new Setting(this.contentEl).addButton((button) =>
			button.setButtonText(texts.showLog).onClick(() => {
				this.close();
				showLog();
			}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** The recent log, read-only, to select and copy. */
export class LogModal extends Modal {
	constructor(
		app: App,
		private readonly options: { title: string; log: string; selectAll: string },
	) {
		super(app);
	}

	onOpen() {
		const { title, log, selectAll } = this.options;
		this.setTitle(title);
		renderSelectableText(this.contentEl, log, { selectAll });
	}

	onClose() {
		this.contentEl.empty();
	}
}
