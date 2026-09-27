import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

/**
 * Read-only text with a Select all button. The plugin never writes to the clipboard; the
 * user selects and copies the text themselves.
 */
export function renderSelectableText(
	container: HTMLElement,
	text: string,
	{ selectAll, hint }: { selectAll: string; hint?: string },
) {
	if (hint) container.createEl('p', { cls: 'setting-item-description', text: hint });
	const area = container.createEl('textarea', {
		attr: { readonly: 'true', rows: '10', spellcheck: 'false' },
		cls: 'drive-bridge-selectable-text',
	});
	area.value = text;
	new Setting(container).addButton((button) =>
		button
			.setButtonText(selectAll)
			.setCta()
			.onClick(() => {
				area.focus();
				// select() alone does not select read-only text on iOS.
				area.setSelectionRange(0, area.value.length);
			}),
	);
	return area;
}

/** A window that shows text to select and copy. */
export class TextModal extends Modal {
	constructor(
		app: App,
		private readonly options: { title: string; text: string; selectAll: string; hint?: string },
	) {
		super(app);
	}

	onOpen() {
		const { title, text, selectAll, hint } = this.options;
		this.setTitle(title);
		renderSelectableText(this.contentEl, text, { hint, selectAll });
	}

	onClose() {
		this.contentEl.empty();
	}
}
