import type { Fragment, Translate } from '@/modules/i18n';
import { addLabel, s } from '@/settings/utils';
import type { SetupStepKey } from './client-setup';
import { SETUP_STEPS } from './client-setup';

export type SetupPageTranslations = {
	setupPage: string;
	setupPageDescription: string;
	setupSteps: Fragment;
	openConsole: string;
	guide: string;
	guideLabelDescription: string;
	signInWithGoogle: string;
	stepSignInDescription: string;
} & Record<SetupStepKey, string> &
	Record<`${SetupStepKey}Description`, string>;

/**
 * The one-time Google Cloud steps, on a page of their own: someone who already has a
 * client and a token never needs them, and on a phone they pushed the fields far down.
 */
export default function setupPage(
	translate: Translate<SetupPageTranslations>,
	visible: () => boolean,
	signIn: () => void,
) {
	return s(
		(self) => ({
			desc: translate('setupPageDescription'),
			items: Object.values(self).map((node) => node(node)),
			labels: [{ text: translate('guide'), tooltip: translate('guideLabelDescription') }],
			name: translate('setupPage'),
			type: 'page',
			visible,
		}),
		{
			100: s(() => ({
				desc: translate('setupSteps'),
				name: 'dummy',
				render: (setting) => setting.settingEl.addClass('drive-bridge-setting-tip'),
				search: false,
			})),
			// One row per Google Cloud step, each opening its Console page.
			...Object.fromEntries(
				SETUP_STEPS.map(({ key, url }, index) => [
					200 + index,
					s(() => ({
						desc: translate(`${key}Description`),
						name: `${index + 1}. ${translate(key)}`,
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(translate('openConsole'))
									.onClick(() => window.open(url)),
							);
						},
						search: false,
					})),
				]),
			),
			// The last step: the client is ready, so sign in with it.
			[200 + SETUP_STEPS.length]: s(() => ({
				desc: translate('stepSignInDescription'),
				name: `${SETUP_STEPS.length + 1}. ${translate('signInWithGoogle')}`,
				render: (setting) => {
					setting.addButton((button) =>
						button
							.setButtonText(translate('signInWithGoogle'))
							.setCta()
							.onClick(signIn),
					);
				},
				search: false,
			})),
		},
	);
}

/**
 * Draws the Guide label on the Set up a Google client entry. Labels on page entries are
 * drawn for the main screen only, and this entry sits on the Google account page, so that
 * page draws it once it has rendered.
 */
export function labelSetupEntry(doc: Document, translate: Translate<SetupPageTranslations>) {
	const name = translate('setupPage');
	for (const entry of doc.querySelectorAll('.setting-item-name'))
		if (entry.firstChild?.textContent === name)
			addLabel(entry, {
				text: translate('guide'),
				tooltip: translate('guideLabelDescription'),
			});
}

/** labelSetupEntry once the page around `el` has rendered. */
export function labelSetupEntryLater(el: HTMLElement, translate: Translate<SetupPageTranslations>) {
	queueMicrotask(() => labelSetupEntry(el.ownerDocument, translate));
}
