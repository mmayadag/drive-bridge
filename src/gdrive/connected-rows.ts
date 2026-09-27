import type { Settings, Events } from '@';
import type { Dispatch } from '@/modules/event-bus';
import type { Translate } from '@/modules/i18n';
import type { CheckConnectionResult } from '@/modules/registrar';
import type { CheckConnectionDB, CheckConnectionTranslations } from '@/settings/check-connection';
import type { MaybePromise } from '@/types';
import { addCheckConnection } from '@/settings/check-connection';
import { s } from '@/settings/utils';
import type { Quota } from './quota';
import { formatBytes } from './quota';

export type ConnectedRowsTranslations = CheckConnectionTranslations & {
	connection: string;
	connectionDescription: string;
	connectionUsage: (sizes: { used: string; limit: string }) => string;
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
	/** The last quota Drive reported, if any, shown on the Connection row. */
	getQuota: () => Quota | undefined;
	/** Connected with the client ID and secret too: only then is there a whole setup to export. */
	ready: () => boolean;
	openExportSettings: () => void;
}) {
	const { translate: t, connected } = ctx;
	return {
		connection: s(() => ({
			desc: describeConnection(ctx.getQuota(), t),
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

/** How much of Drive is used, once known; otherwise what the check does. */
export function describeConnection(
	quota: Quota | undefined,
	t: Translate<ConnectedRowsTranslations>,
) {
	if (!quota?.limit) return t('connectionDescription');
	return t('connectionUsage', { limit: formatBytes(quota.limit), used: formatBytes(quota.used) });
}
