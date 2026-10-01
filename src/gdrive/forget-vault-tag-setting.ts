import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { Translate } from '@/modules/i18n';
import type { CallableOrObjectTree } from '@/modules/setting';
import ConfirmModal from '@/components/confirm-modal';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';
import { s } from '@/settings/utils';
import type { SnapshotDB } from './changes';
import { forgetVaultTag } from './vault-tag';

export type ForgetVaultTagTranslations = {
	forgetVaultTag: string;
	forgetVaultTagDescription: string;
	forgetVaultTagConfirm: string;
	vaultTagForgotten: string;
	cancel: string;
};

/**
 * Next to Clear records: forgets this device's id for the vault folder (#78), so the next
 * sync adopts whatever the folder currently carries, or starts a fresh one (#228).
 */
export default function forgetVaultTagSetting({
	app,
	indexedDB,
	translate,
}: {
	app: App;
	indexedDB: SnapshotDB;
	translate: Translate<ForgetVaultTagTranslations>;
}): CallableOrObjectTree {
	return {
		[MORE]: {
			[PAGE.advanced]: {
				[ADVANCED.development]: {
					1700: s(() => ({
						desc: translate('forgetVaultTagDescription'),
						name: translate('forgetVaultTag'),
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(translate('forgetVaultTag'))
									.setDestructive()
									.onClick(() =>
										new ConfirmModal(app, {
											cancel: translate('cancel'),
											confirm: translate('forgetVaultTag'),
											message: translate('forgetVaultTagConfirm'),
											onConfirm: async () => {
												await forgetVaultTag(indexedDB);
												new Notice(translate('vaultTagForgotten'));
											},
											title: translate('forgetVaultTag'),
										}).open(),
									),
							);
						},
					})),
				},
			},
		},
	};
}
