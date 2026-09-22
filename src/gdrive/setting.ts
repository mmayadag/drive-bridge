import type { Events } from '@';
import type { App, SettingGroupItem, TextComponent } from 'obsidian';
import { Notice } from 'obsidian';
import type { Dispatch } from '@/modules/event-bus';
import type { Fragment, Snippet, Translate } from '@/modules/i18n';
import type { Request } from '@/modules/registrar';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { LabelDefinition } from '@/settings/utils';
import { s } from '@/settings/utils';
import { normalizeBaseDir } from '@/shared/path';
import type { GdriveSettings } from '.';
import type { TokenManager } from './auth';
import type { FolderPickerTranslations } from './folder-picker';
import { connectWithToken } from './connect';
import FolderPickerModal from './folder-picker';

export type GdriveTranslations = FolderPickerTranslations & {
	gdrive: string;
	connectAccount: string;
	accountConnected: string;
	accountConnectedDescription: Snippet<string>;
	connectAccountDescription: Fragment;
	connect: string;
	disconnect: string;
	configureFirst: string;
	connectSuccess: string;
	baseDirectory: string;
	baseDirectoryDescription: Fragment;
	baseDirectoryPlaceholder: string;
	useTrash: string;
	useTrashDescription: string;
	authorizationFailed: Snippet<string>;
	setupSteps: Fragment;
	clientId: string;
	clientIdDescription: string;
	clientSecret: string;
	clientSecretDescription: string;
	connectFirst: string;
	invalidRefreshToken: string;
	limitedScope: string;
	refreshTokenPlaceholder: string;
};

export default function gdriveSetting(
	{
		translate,
		saveSettings,
		matchLabel,
		refreshSettingTab,
		dispatch,
		app,
		getRequest,
	}: {
		translate: Translate<GdriveTranslations>;
		saveSettings: () => Promise<void>;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		dispatch: Dispatch<Events>;
		app: App;
		getRequest: () => Request;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	const connect = async (input: string) => {
		const result = await connectWithToken(tokenManager, input);
		if (result.status === 'connected') {
			settings.userId = result.account.userId;
			settings.accountEmail = result.account.email;
			void saveSettings();
			new Notice(translate('connectSuccess'));
			refreshSettingTab();
			return;
		}
		if (result.status === 'noClient') {
			new Notice(translate('configureFirst'));
			return;
		}
		if (result.status === 'badToken') {
			new Notice(translate('invalidRefreshToken'));
			return;
		}
		const reason = result.status === 'limitedScope' ? translate('limitedScope') : result.reason;
		new Notice(translate('authorizationFailed', reason), 5000);
		dispatch('errorGeneral', `Google Drive auth failed: \`${reason}\`.`);
	};

	return {
		551: s(
			(self) => ({
				heading: translate('gdrive'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				100: s(() => ({
					desc: translate('setupSteps'),
					name: 'dummy',
					render: (setting) => setting.settingEl.addClass('drive-bridge-setting-tip'),
					search: false,
				})),
				1000: s(() => ({
					desc: translate('clientIdDescription'),
					name: translate('clientId'),
					render: (setting) => {
						setting.addText((text) => {
							text.setValue(settings.clientId).inputEl.addEventListener(
								'blur',
								() => {
									const value = text.getValue().trim();
									text.setValue(value);
									if (value === settings.clientId) return;
									settings.clientId = value;
									void saveSettings();
								},
							);
						});
					},
				})),
				1010: s(() => ({
					desc: translate('clientSecretDescription'),
					name: translate('clientSecret'),
					render: (setting) => {
						setting.addText((text) => {
							text.inputEl.type = 'password';
							text.setValue(tokenManager.getCredentials().clientSecret);
							text.inputEl.addEventListener('blur', () => {
								const value = text.getValue().trim();
								text.setValue(value);
								tokenManager.setClientSecret(value);
							});
						});
					},
				})),
				1020: s(() => ({
					desc: translate('connectAccountDescription'),
					name: translate('connectAccount'),
					render: (setting) => {
						let input = '';
						setting
							.addText((text) => {
								text.inputEl.type = 'password';
								text.setPlaceholder(translate('refreshTokenPlaceholder')).onChange(
									(value) => (input = value),
								);
							})
							.addButton((button) =>
								button
									.setButtonText(translate('connect'))
									.setCta()
									.onClick(() => connect(input)),
							);
					},
					visible: () => !tokenManager.getRefreshToken(),
				})),
				1030: s(() => ({
					desc: translate('accountConnectedDescription', settings.accountEmail),
					name: translate('accountConnected'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('disconnect'))
								.setDestructive()
								// Forgets the token on this device only.
								// Other devices and the backup server may share it, so it is never revoked.
								.onClick(() => {
									settings.userId = '';
									settings.accountEmail = '';
									tokenManager.deleteRefreshToken();
									tokenManager.invalidate();
									void saveSettings();
									refreshSettingTab();
								}),
						);
					},
					visible: () => Boolean(tokenManager.getRefreshToken()),
				})),
				2000: s(() => ({
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
				})),
				3000: s(() => ({
					desc: translate('useTrashDescription'),
					name: translate('useTrash'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.useTrash).onChange((value) => {
								settings.useTrash = value;
								void saveSettings();
							}),
						);
					},
				})),
			},
		),
	};
}
