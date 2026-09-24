import type { App } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';

const MIN_PASSPHRASE = 8;

export type ExportTexts = {
	title: string;
	includeAccount: string;
	includeAccountDescription: string;
	passphrase: string;
	passphraseDescription: string;
	repeatPassphrase: string;
	passphraseTooShort: string;
	passphraseMismatch: string;
	copy: string;
	copied: string;
	saveToVault: string;
	saved: (path: string) => string;
};

export class ExportModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			texts: ExportTexts;
			build: (passphrase?: string) => Promise<string>;
			save: (text: string) => Promise<string>;
		},
	) {
		super(app);
	}

	onOpen() {
		const { texts, build, save } = this.options;
		this.setTitle(texts.title);
		let include = true;
		let passphrase = '';
		let repeated = '';
		const secretRows: Array<Setting> = [];
		new Setting(this.contentEl)
			.setName(texts.includeAccount)
			.setDesc(texts.includeAccountDescription)
			.addToggle((toggle) =>
				toggle.setValue(include).onChange((value) => {
					include = value;
					for (const row of secretRows) row.settingEl.toggle(value);
				}),
			);
		secretRows.push(
			new Setting(this.contentEl)
				.setName(texts.passphrase)
				.setDesc(texts.passphraseDescription)
				.addText((text) => {
					text.inputEl.type = 'password';
					text.onChange((value) => (passphrase = value));
				}),
			new Setting(this.contentEl).setName(texts.repeatPassphrase).addText((text) => {
				text.inputEl.type = 'password';
				text.onChange((value) => (repeated = value));
			}),
		);
		const produce = async () => {
			if (!include) return build();
			if (passphrase.length < MIN_PASSPHRASE)
				return void new Notice(texts.passphraseTooShort);
			if (passphrase !== repeated) return void new Notice(texts.passphraseMismatch);
			return build(passphrase);
		};
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(texts.saveToVault).onClick(async () => {
					const text = await produce();
					if (!text) return;
					new Notice(texts.saved(await save(text)));
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(texts.copy)
					.setCta()
					.onClick(async () => {
						const text = await produce();
						if (!text) return;
						await navigator.clipboard.writeText(text);
						new Notice(texts.copied);
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export type ImportPreview =
	| { valid: false }
	| { valid: true; changes: number; hasSecrets: boolean };

export type ImportTexts = {
	title: string;
	paste: string;
	notAnExport: string;
	summary: (preview: { changes: number; hasSecrets: boolean }) => string;
	passphrase: string;
	import: string;
};

export class ImportModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			texts: ImportTexts;
			preview: (text: string) => ImportPreview;
			/** Applies the import; throws with a message the user should see. */
			apply: (text: string, passphrase: string) => Promise<void>;
		},
	) {
		super(app);
	}

	onOpen() {
		const { texts, preview, apply } = this.options;
		this.setTitle(texts.title);
		let text = '';
		let passphrase = '';
		const area = this.contentEl.createEl('textarea', {
			attr: { placeholder: texts.paste, rows: '6' },
			cls: 'drive-bridge-transfer-input',
		});
		const summary = this.contentEl.createEl('p', { cls: 'setting-item-description' });
		const secretRow = new Setting(this.contentEl).setName(texts.passphrase).addText((field) => {
			field.inputEl.type = 'password';
			field.onChange((value) => (passphrase = value));
		});
		let importButton: HTMLButtonElement | undefined;
		const update = () => {
			const result = preview(text);
			summary.setText(
				text.trim() && !result.valid
					? texts.notAnExport
					: result.valid
						? texts.summary(result)
						: '',
			);
			secretRow.settingEl.toggle(result.valid && result.hasSecrets);
			importButton?.toggleAttribute('disabled', !result.valid);
		};
		area.addEventListener('input', () => {
			text = area.value;
			update();
		});
		new Setting(this.contentEl).addButton((button) => {
			importButton = button.buttonEl;
			button
				.setButtonText(texts.import)
				.setCta()
				.onClick(async () => {
					try {
						await apply(text, passphrase);
						this.close();
					} catch (error) {
						new Notice(error instanceof Error ? error.message : String(error));
					}
				});
		});
		update();
	}

	onClose() {
		this.contentEl.empty();
	}
}
