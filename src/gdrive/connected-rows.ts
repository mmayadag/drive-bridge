import type { Settings, Events } from '@';
import type { Dispatch } from '@/modules/event-bus';
import type { Translate } from '@/modules/i18n';
import type { CheckConnectionResult } from '@/modules/registrar';
import type { CheckConnectionDB, CheckConnectionTranslations } from '@/settings/check-connection';
import type { MaybePromise } from '@/types';
import { addCheckConnection } from '@/settings/check-connection';
import { s } from '@/settings/utils';

export type ConnectedRowsTranslations = CheckConnectionTranslations & {
	connection: string;
	connectionDescription: string;
	testConnection: string;
	setUpAnotherDevice: string;
	setUpAnotherDeviceDescription: string;
	exportSettings: string;
};

/** What a connected device offers under its account: a connection test, and export. */
export default function connectedRows(ctx: {
	translate: Translate<ConnectedRowsTranslations>;
	dispatch: Dispatch<Events>;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	memoryDB: CheckConnectionDB;
	settings: Settings;
	connected: () => boolean;
	/** Connected with the client ID and secret too: only then is there a whole setup to export. */
	ready: () => boolean;
	openExportSettings: () => void;
}) {
	const { translate: t, connected } = ctx;
	return {
		connection: s(() => ({
			desc: t('connectionDescription'),
			name: t('connection'),
			render: (setting) => {
				// The icon shows the last result; the button runs the check again and says how it went.
				const checks = addCheckConnection(setting, ctx, connected);
				setting.addButton((button) =>
					button
						.setButtonText(t('testConnection'))
						.onClick(() => void checks.check(true)),
				);
				return checks.cleanup;
			},
			visible: connected,
		})),
		exportForAnotherDevice: s(() => ({
			desc: t('setUpAnotherDeviceDescription'),
			name: t('setUpAnotherDevice'),
			render: (setting) => {
				setting.addButton((button) =>
					button.setButtonText(t('exportSettings')).onClick(ctx.openExportSettings),
				);
			},
			visible: ctx.ready,
		})),
	};
}
