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
import { connectWithToken, findMissingInput } from './connect';
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
	enterClientId: string;
	enterClientSecret: string;
	enterRefreshToken: string;
	invalidRefreshToken: string;
	limitedScope: string;
	oauthClient: string;
	oauthClientDescription: string;
	oauthClientMissing: string;
	oauthClientSet: string;
	refreshTokenPlaceholder: string;
};

export default function gdriveSetting(
	{
		translate,
		saveSettings,
		matchLabel,
		refreshSettingTab,
		rerenderSettingTab,
		dispatch,
		app,
		getRequest,
	}: {
		translate: Translate<GdriveTranslations>;
		saveSettings: () => Promise<void>;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		rerenderSettingTab: () => void;
		dispatch: Dispatch<Events>;
		app: App;
		getRequest: () => Request;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	let tokenField: TextComponent | undefined;

	const INVALID = 'drive-bridge-invalid-input';

	const markValid = (text: TextComponent) => {
		text.onChange(() => text.inputEl.removeClass(INVALID));
		return text;
	};

	const demand = (field: TextComponent | undefined, message: string) => {
		new Notice(message);
		field?.inputEl.addClass(INVALID);
		field?.inputEl.focus();
	};

	const connect = async (input: string) => {
		// The client fields live on the OAuth client page and save on blur, so the
		// stored values are what is entered.
		const missing = findMissingInput({ ...tokenManager.getCredentials(), token: input });
		if (missing === 'clientId') return void new Notice(translate('enterClientId'));
		if (missing === 'clientSecret') return void new Notice(translate('enterClientSecret'));
		if (missing === 'token') return demand(tokenField, translate('enterRefreshToken'));

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
			demand(tokenField, translate('invalidRefreshToken'));
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
				1000: s(
					(self) => ({
						desc: translate('oauthClientDescription'),
						displayValue: () =>
							translate(
								tokenManager.hasCredentials()
									? 'oauthClientSet'
									: 'oauthClientMissing',
							),
						items: Object.values(self).map((node) => node(node)),
						name: translate('oauthClient'),
						// oxlint-disable-next-line unicorn/no-null -- Obsidian's status type has no undefined
						status: () => (tokenManager.hasCredentials() ? null : 'warning'),
						type: 'page',
					}),
					{
						100: s(() => ({
							desc: translate('setupSteps'),
							name: 'dummy',
							render: (setting) =>
								setting.settingEl.addClass('drive-bridge-setting-tip'),
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
											rerenderSettingTab();
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
										if (value === tokenManager.getCredentials().clientSecret)
											return;
										tokenManager.setClientSecret(value);
										rerenderSettingTab();
									});
								});
							},
						})),
					},
				),
				1020: s(() => ({
					desc: translate('connectAccountDescription'),
					name: translate('connectAccount'),
					render: (setting) => {
						let input = '';
						// The token is long. This row gives the field and the button a line
						// of their own under the description, instead of squeezing both
						// into the control column.
						setting.settingEl.addClass('drive-bridge-stacked-setting');
						setting
							.addText((text) => {
								tokenField = markValid(text);
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
