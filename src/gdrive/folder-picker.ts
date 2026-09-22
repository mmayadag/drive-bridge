import type { App, TextComponent } from 'obsidian';
import { Modal, Notice, setIcon, Setting } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { Request } from '@/modules/registrar';
import { getMessage } from '@/shared/error';
import type { DriveFolder } from './folders';
import { createFolder, isUsableFolderName, listFolders } from './folders';

export type FolderPickerTranslations = {
	pickFolder: string;
	pickFolderTitle: string;
	myDrive: string;
	useThisFolder: string;
	newFolder: string;
	newFolderPrompt: string;
	create: string;
	cancel: string;
	noSubfolders: string;
	folderListFailed: string;
	pickSubfolder: string;
	folderNameSlash: string;
};

const ROOT: DriveFolder = { id: 'root', name: '' };

/**
 * Browses the Drive folder tree and returns the chosen folder as a vault-style path
 * (`Parent/Child/`), which is what the base directory setting expects.
 */
export default class FolderPickerModal extends Modal {
	private trail: Array<DriveFolder> = [ROOT];
	private folders: Array<DriveFolder> = [];
	private loading = true;

	constructor(
		app: App,
		private readonly options: {
			request: Request;
			translate: Translate<FolderPickerTranslations>;
			onChoose: (path: string) => void;
		},
	) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.options.translate('pickFolderTitle'));
		void this.load();
	}

	onClose() {
		this.contentEl.empty();
	}

	private get current() {
		return this.trail.at(-1) ?? ROOT;
	}

	private readonly path = () =>
		this.trail
			.slice(1)
			.map((folder) => folder.name)
			.join('/');

	private readonly load = async () => {
		const { request, translate } = this.options;
		this.loading = true;
		this.render();
		try {
			this.folders = (await listFolders(request, this.current.id)).filter((folder) =>
				isUsableFolderName(folder.name),
			);
		} catch (error) {
			new Notice(`${translate('folderListFailed')}: ${getMessage(error)}`, 5000);
			this.folders = [];
		}
		this.loading = false;
		this.render();
	};

	private readonly enter = (folder: DriveFolder) => {
		this.trail.push(folder);
		void this.load();
	};

	private readonly goTo = (index: number) => {
		this.trail = this.trail.slice(0, index + 1);
		void this.load();
	};

	private readonly addFolder = async (name: string) => {
		const { request, translate } = this.options;
		if (!isUsableFolderName(name)) {
			new Notice(translate('folderNameSlash'), 5000);
			return;
		}
		try {
			const folder = await createFolder(request, this.current.id, name);
			this.enter(folder);
		} catch (error) {
			new Notice(`${translate('folderListFailed')}: ${getMessage(error)}`, 5000);
		}
	};

	private readonly render = () => {
		let newFolderName: TextComponent | undefined;
		const { contentEl } = this;
		const { translate } = this.options;
		contentEl.empty();

		const crumbs = contentEl.createDiv('drive-bridge-folder-crumbs');
		this.trail.forEach((folder, index) => {
			if (index > 0) crumbs.createSpan({ text: '/' });
			const crumb = crumbs.createEl('a', {
				text: index === 0 ? translate('myDrive') : folder.name,
			});
			crumb.addEventListener('click', () => this.goTo(index));
		});

		const list = contentEl.createDiv('drive-bridge-folder-list');
		if (this.loading) {
			const spinner = list.createDiv('drive-bridge-spin');
			setIcon(spinner, 'loader-circle');
		} else if (this.folders.length === 0)
			list.createDiv({ cls: 'drive-bridge-folder-empty', text: translate('noSubfolders') });
		else
			for (const folder of this.folders) {
				const row = list.createDiv('drive-bridge-folder-row');
				setIcon(row.createSpan('drive-bridge-folder-icon'), 'folder');
				row.createSpan({ text: folder.name });
				row.addEventListener('click', () => this.enter(folder));
			}

		const atRoot = this.trail.length === 1;
		new Setting(contentEl)
			.addText((text) => {
				text.setPlaceholder(translate('newFolderPrompt')).inputEl.addEventListener(
					'keydown',
					(event) => {
						if (event.key !== 'Enter') return;
						const name = text.getValue().trim();
						if (name) void this.addFolder(name);
					},
				);
				newFolderName = text;
			})
			.addButton((button) =>
				button.setButtonText(translate('newFolder')).onClick(() => {
					const name = newFolderName?.getValue().trim();
					if (name) void this.addFolder(name);
				}),
			)
			.addButton((button) => {
				button
					.setCta()
					.setButtonText(translate('useThisFolder'))
					// The whole Drive is never a sensible target, so a folder must be open.
					.setDisabled(atRoot)
					.setTooltip(atRoot ? translate('pickSubfolder') : '')
					.onClick(() => {
						this.options.onChoose(`${this.path()}/`);
						this.close();
					});
			});
	};
}
