import type { App, SettingGroupItem } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';
import type {
	CallableOrObjectTree,
	Dispatch,
	Fragment,
	LabelDefinition,
	Snippet,
	Translate,
	Translations,
	Events,
} from '@/sdk';
import { s } from '@/sdk';
import { getMessage } from '@/shared/error';
import { normalizeBaseDir } from '@/shared/path';
import type { GdriveSettings } from '.';
import type { TokenManager } from './auth';
import { pollDeviceToken, revokeToken, startDeviceAuthorization } from './auth';

export type GdriveTranslations = {
	gdrive: string;
	connectAccount: string;
	accountConnected: string;
	accountConnectedDescription: string;
	connectAccountDescription: string;
	connect: string;
	disconnect: string;
	configureFirst: string;
	deviceCodeTitle: string;
	deviceCodeInstruction: Fragment<string>;
	copyAndOpenGoogle: string;
	waitingApproval: string;
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
};

type DeviceCodeModalOptions = {
	translate: Translate<GdriveTranslations & Translations>;
	userCode: string;
	verificationUrl: string;
	onClose: () => void;
};

class DeviceCodeModal extends Modal {
	constructor(
		app: App,
		private readonly options: DeviceCodeModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const {
			contentEl,
			titleEl,
			options: { translate, userCode, verificationUrl },
		} = this;
		titleEl.setText(translate('deviceCodeTitle'));
		contentEl.addClass('markdown-rendered');
		contentEl.createEl('p', {
			text: translate('deviceCodeInstruction', verificationUrl),
		});
		contentEl.createEl('code', { cls: 'drive-bridge-device-code', text: userCode });
		contentEl.createEl('p', {
			cls: 'drive-bridge-device-code-status',
			text: translate('waitingApproval'),
		});
		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(translate('cancel'))
					.setDestructive()
					.onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(translate('copyAndOpenGoogle'))
					.onClick(() => {
						void navigator.clipboard.writeText(userCode);
						window.open(verificationUrl);
						button.setIcon('check');
					}),
			);
	}
	onClose(): void {
		this.contentEl.empty();
		this.options.onClose();
	}
}

export default function gdriveSetting(
	{
		translate,
		saveSettings,
		app,
		matchLabel,
		refreshSettingTab,
		dispatch,
	}: {
		translate: Translate<GdriveTranslations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		dispatch: Dispatch<Events>;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	const connectGoogle = async (resolve: () => void) => {
		let cancelled = false;
		if (!tokenManager.hasCredentials()) {
			new Notice(translate('configureFirst'));
			resolve();
			return;
		}
		const credentials = tokenManager.getCredentials();
		try {
			const authorization = await startDeviceAuthorization(credentials);
			const modal = new DeviceCodeModal(app, {
				onClose: () => {
					cancelled = true;
					resolve();
				},
				translate,
				userCode: authorization.userCode,
				verificationUrl: authorization.verificationUrl,
			});
			modal.open();
			try {
				const { refreshToken, userId, accessToken, expiresIn } = await pollDeviceToken({
					authorization,
					credentials,
					isCancelled: () => cancelled,
				});
				tokenManager.setRefreshToken(refreshToken);
				settings.userId = userId;
				tokenManager.setToken(accessToken, expiresIn);
				void saveSettings();
				new Notice(translate('connectSuccess'));
				refreshSettingTab();
			} finally {
				modal.close();
			}
		} catch (error) {
			if (cancelled) return;
			const reason = getMessage(error);
			new Notice(translate('authorizationFailed', reason), 5);
			dispatch('errorGeneral', `Google Drive auth failed: \`${reason}\`.`);
		} finally {
			resolve();
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
						setting.addButton((button) =>
							button
								.setButtonText(translate('connect'))
								.setCta()
								.onClick(
									() =>
										new Promise<void>((resolve) => {
											void connectGoogle(resolve);
										}),
								),
						);
					},
					visible: () => !tokenManager.getRefreshToken(),
				})),
				1030: s(() => ({
					desc: translate('accountConnectedDescription'),
					name: translate('accountConnected'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('disconnect'))
								.setDestructive()
								.onClick(async () => {
									const token = tokenManager.getRefreshToken();
									if (!token) return;
									await revokeToken(token);
									settings.userId = '';
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
