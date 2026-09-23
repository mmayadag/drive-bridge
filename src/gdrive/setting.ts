import type { Events, Settings } from '@';
import type { App, SettingGroupItem, TextComponent } from 'obsidian';
import { Notice, Platform } from 'obsidian';
import type { Dispatch } from '@/modules/event-bus';
import type { Fragment, Snippet, Translate } from '@/modules/i18n';
import type { CheckConnectionResult, Request } from '@/modules/registrar';
import type { CallableOrObjectTree } from '@/modules/setting';
import type { CheckConnectionDB, CheckConnectionTranslations } from '@/settings/check-connection';
import type { LabelDefinition } from '@/settings/utils';
import type { MaybePromise } from '@/types';
import { addCheckConnection } from '@/settings/check-connection';
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
	connected: string;
	googleAccount: string;
	clientIdMissing: string;
	clientSecretMissing: string;
	clickToConnect: string;
	tapToConnect: string;
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
	refreshTokenPlaceholder: string;
};

type AccountHintKey =
	| 'clickToConnect'
	| 'tapToConnect'
	| 'clientIdMissing'
	| 'clientSecretMissing'
	| 'connected';

/** What the Google account entry shows: the email, or what to do next. */
export function describeAccount(state: {
	connected: boolean;
	clientId: string;
	clientSecret: string;
	email: string;
	mobile: boolean;
}): { key: AccountHintKey; email?: string } {
	if (!state.connected) return { key: state.mobile ? 'tapToConnect' : 'clickToConnect' };
	if (!state.clientId) return { key: 'clientIdMissing' };
	if (!state.clientSecret) return { key: 'clientSecretMissing' };
	return state.email ? { email: state.email, key: 'connected' } : { key: 'connected' };
}

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
		memoryDB,
		getCheckConnection,
		settings: rootSettings,
	}: {
		translate: Translate<GdriveTranslations & CheckConnectionTranslations>;
		saveSettings: () => Promise<void>;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		rerenderSettingTab: () => void;
		dispatch: Dispatch<Events>;
		app: App;
		getRequest: () => Request;
		memoryDB: CheckConnectionDB;
		getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
		settings: Settings;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	// The three fields Connect needs, all on the Google account page. Kept here so
	// Connect can point at whichever one is still empty instead of spending a
	// round trip to Google to find out.
	let clientIdField: TextComponent | undefined;
	let clientSecretField: TextComponent | undefined;
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

	// Reads what is on screen: the fields save on blur, and a click on Connect
	// blurs first, but a keyboard activation may not.
	const entered = (field: TextComponent | undefined, stored: string) =>
		(field ? field.getValue() : stored).trim();

	const connected = () => Boolean(tokenManager.getRefreshToken());
	// A token without this device's client secret cannot refresh, so the client
	// fields stay reachable until both are there.
	const ready = () => connected() && tokenManager.hasCredentials();

	const refresh = () => {
		refreshSettingTab();
		rerenderSettingTab();
	};

	const connect = async (input: string) => {
		const credentials = tokenManager.getCredentials();
		const missing = findMissingInput({
			clientId: entered(clientIdField, credentials.clientId),
			clientSecret: entered(clientSecretField, credentials.clientSecret),
			token: input,
		});
		if (missing === 'clientId') return demand(clientIdField, translate('enterClientId'));
		if (missing === 'clientSecret')
			return demand(clientSecretField, translate('enterClientSecret'));
		if (missing === 'token') return demand(tokenField, translate('enterRefreshToken'));

		const result = await connectWithToken(tokenManager, input);
		if (result.status === 'connected') {
			settings.userId = result.account.userId;
			settings.accountEmail = result.account.email;
			void saveSettings();
			new Notice(translate('connectSuccess'));
			refresh();
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
						displayValue: () => {
							const hint = describeAccount({
								...tokenManager.getCredentials(),
								connected: connected(),
								email: settings.accountEmail,
								mobile: Platform.isMobile,
							});
							return hint.email ?? translate(hint.key);
						},
						items: Object.values(self).map((node) => node(node)),
						name: translate('googleAccount'),
						// oxlint-disable-next-line unicorn/no-null -- Obsidian's status type has no undefined
						status: () => (ready() ? null : 'warning'),
						type: 'page',
					}),
					{
						100: s(() => ({
							desc: translate('setupSteps'),
							name: 'dummy',
							render: (setting) =>
								setting.settingEl.addClass('drive-bridge-setting-tip'),
							search: false,
							visible: () => !ready(),
						})),
						1000: s(() => ({
							desc: translate('clientIdDescription'),
							name: translate('clientId'),
							render: (setting) => {
								setting.addText((text) => {
									clientIdField = markValid(text);
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
							visible: () => !ready(),
						})),
						1010: s(() => ({
							desc: translate('clientSecretDescription'),
							name: translate('clientSecret'),
							render: (setting) => {
								setting.addText((text) => {
									clientSecretField = markValid(text);
									text.inputEl.type = 'password';
									text.setValue(tokenManager.getCredentials().clientSecret);
									text.inputEl.addEventListener('blur', () => {
										const value = text.getValue().trim();
										text.setValue(value);
										tokenManager.setClientSecret(value);
									});
								});
							},
							visible: () => !ready(),
						})),
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
										text.setPlaceholder(
											translate('refreshTokenPlaceholder'),
										).onChange((value) => (input = value));
									})
									.addButton((button) =>
										button
											.setButtonText(translate('connect'))
											.setCta()
											.onClick(() => connect(input)),
									);
							},
							visible: () => !connected(),
						})),
						1030: s(() => ({
							desc: translate('accountConnectedDescription', settings.accountEmail),
							name: translate('accountConnected'),
							render: (setting) => {
								const checks = addCheckConnection(
									setting,
									{
										dispatch,
										getCheckConnection,
										memoryDB,
										settings: rootSettings,
										translate,
									},
									connected,
								);
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
											refresh();
										}),
								);
								return checks.cleanup;
							},
							visible: connected,
						})),
					},
				),
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
