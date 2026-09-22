import type { Events } from '@';
import type { SettingGroupItem } from 'obsidian';
import { Notice } from 'obsidian';
import type { Dispatch } from '@/modules/EventBus';
import type { Fragment, Snippet, Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Setting';
import type { LabelDefinition } from '@/settings/utils';
import { s } from '@/settings/utils';
import { getMessage } from '@/shared/error';
import { normalizeBaseDir } from '@/shared/path';
import type { GdriveSettings } from '.';
import type { TokenManager } from './auth';
import { fetchAccount, parseRefreshToken } from './auth';

export type GdriveTranslations = {
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
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	useTrash: string;
	useTrashDescription: string;
	authorizationFailed: Snippet<string>;
	clientId: string;
	clientIdDescription: string;
	clientSecret: string;
	clientSecretDescription: string;
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
	}: {
		translate: Translate<GdriveTranslations>;
		saveSettings: () => Promise<void>;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		dispatch: Dispatch<Events>;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	const connect = async (input: string) => {
		if (!tokenManager.hasCredentials()) {
			new Notice(translate('configureFirst'));
			return;
		}
		const refreshToken = parseRefreshToken(input);
		if (!refreshToken) {
			new Notice(translate('invalidRefreshToken'));
			return;
		}
		tokenManager.setRefreshToken(refreshToken);
		tokenManager.invalidate();
		try {
			const accessToken = await tokenManager.getToken(true);
			if (!tokenManager.hasFullDriveScope()) throw new Error(translate('limitedScope'));
			const { userId, email } = await fetchAccount(accessToken);
			settings.userId = userId;
			settings.accountEmail = email;
			void saveSettings();
			new Notice(translate('connectSuccess'));
			refreshSettingTab();
		} catch (error) {
			tokenManager.deleteRefreshToken();
			tokenManager.invalidate();
			const reason = getMessage(error);
			new Notice(translate('authorizationFailed', reason), 5000);
			dispatch('errorGeneral', `Google Drive auth failed: \`${reason}\`.`);
		}
	};

	return {
		551: s(
			(self) => ({
				heading: translate('gdrive'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
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
						setting.addText((text) => {
							text.setPlaceholder(translate('baseDirectoryPlaceholder'))
								.setValue(settings.baseDirectory)
								.inputEl.addEventListener('blur', () => {
									const normalized = normalizeBaseDir(text.getValue().trim());
									text.setValue(normalized);
									settings.baseDirectory = normalized;
									void saveSettings();
								});
						});
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
