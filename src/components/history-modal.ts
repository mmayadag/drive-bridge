import type { App } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';
import type { SyncSummary } from '@/sync/history';

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

/** The recent log, read-only, with a copy button. */
export class LogModal extends Modal {
	constructor(
		app: App,
		private readonly options: { title: string; log: string; copy: string; copied: string },
	) {
		super(app);
	}

	onOpen() {
		const { title, log, copy, copied } = this.options;
		this.setTitle(title);
		this.contentEl.createEl('pre', { cls: 'drive-bridge-log', text: log });
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(copy)
				.setCta()
				.onClick(async () => {
					await navigator.clipboard.writeText(log);
					new Notice(copied);
				}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
