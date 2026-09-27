import type { App, TextComponent } from 'obsidian';
import { Notice } from 'obsidian';
import type { Fragment, Translate } from '@/modules/i18n';
import type { Request } from '@/modules/registrar';
import type { LabelDefinition } from '@/settings/utils';
import { s } from '@/settings/utils';
import { normalizeBaseDir } from '@/shared/path';
import type { GdriveSettings } from '.';
import type { TokenManager } from './auth';
import type { FolderPickerTranslations } from './folder-picker';
import FolderPickerModal from './folder-picker';

export type BaseDirectoryTranslations = FolderPickerTranslations & {
	baseDirectory: string;
	baseDirectoryPlaceholder: string;
	pickFolder: string;
	connectFirst: string;
	baseDirectoryDescription: Fragment;
};

/** The Drive folder for this vault: typed, or picked by browsing Drive. */
export default function baseDirectorySetting({
	app,
	getRequest,
	matchLabel,
	saveSettings,
	settings,
	tokenManager,
	translate,
}: {
	app: App;
	getRequest: () => Request;
	matchLabel: () => LabelDefinition;
	saveSettings: () => Promise<void>;
	settings: GdriveSettings;
	tokenManager: TokenManager;
	translate: Translate<BaseDirectoryTranslations>;
}) {
	return s(() => ({
		desc: translate('baseDirectoryDescription'),
		labels: [matchLabel()],
		name: translate('baseDirectory'),
		render: (setting) => {
			const save = (value: string) => {
				const normalized = normalizeBaseDir(value.trim());
				settings.baseDirectory = normalized;
				void saveSettings();
				return normalized;
			};
			let field: TextComponent;
			setting
				.addText((text) => {
					field = text;
					text.setPlaceholder(translate('baseDirectoryPlaceholder'))
						.setValue(settings.baseDirectory)
						.inputEl.addEventListener('blur', () => {
							text.setValue(save(text.getValue()));
						});
				})
				.addExtraButton((button) =>
					button
						.setIcon('folder-open')
						.setTooltip(translate('pickFolder'))
						.onClick(() => {
							if (!tokenManager.getRefreshToken()) {
								new Notice(translate('connectFirst'));
								return;
							}
							new FolderPickerModal(app, {
								onChoose: (path) => {
									field.setValue(save(path));
								},
								request: getRequest(),
								translate,
							}).open();
						}),
				);
		},
	}));
}
