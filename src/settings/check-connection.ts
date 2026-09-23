import type { Settings, Events } from '@';
import type { ExtraButtonComponent, Setting } from 'obsidian';
import { Notice } from 'obsidian';
import type { Dispatch } from '@/modules/event-bus';
import type { Translate } from '@/modules/i18n';
import type { CheckConnectionResult } from '@/modules/registrar';
import type { DatabaseSync } from '@/shared/key-value-store';
import type { MaybePromise } from '@/types';
import { getMessage } from '@/shared/error';

const CHECK_CONNECTION_INTERVAL = 10_000;

export type CheckConnectionDB = DatabaseSync<Record<string, unknown>, { lastCheckedFs: string }>;

export type CheckConnectionTranslations = {
	checkConnection: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
};

type CheckConnectionContext = {
	memoryDB: CheckConnectionDB;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	settings: Settings;
	translate: Translate<CheckConnectionTranslations>;
	dispatch: Dispatch<Events>;
};

/**
 * Adds the icon that checks access to the storage backend, and runs a first check unless
 * `when` says the backend cannot be reached yet.
 */
export function addCheckConnection(
	setting: Setting,
	ctx: CheckConnectionContext,
	when: () => boolean = () => true,
) {
	let checks!: ReturnType<typeof setupCheckConnection>;
	setting.addExtraButton((button) => {
		checks = setupCheckConnection({
			button: button
				.setTooltip(ctx.translate('checkConnection'))
				.onClick(() => void checks.check(true)),
			getCheckConnection: ctx.getCheckConnection,
			log: (str: string) => ctx.dispatch('errorGeneral', str),
			memoryDB: ctx.memoryDB,
			settings: ctx.settings,
			translate: ctx.translate,
		});
		if (when()) void checks.check(false);
	});
	return checks;
}

function setupCheckConnection({
	memoryDB,
	getCheckConnection,
	settings,
	translate,
	button,
	log,
}: {
	memoryDB: CheckConnectionDB;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	settings: Settings;
	translate: Translate<CheckConnectionTranslations>;
	button: ExtraButtonComponent;
	log: (str: string) => void;
}) {
	let timeout: number | undefined;
	const possibleClasses = [
		'drive-bridge-status-ok',
		'drive-bridge-status-error',
		'drive-bridge-status-pending',
		'drive-bridge-spin',
	];
	const setChecking = () => {
		button.setIcon('loader-circle');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['drive-bridge-spin', 'drive-bridge-status-pending']);
	};
	const setSuccess = () => {
		button.setIcon('check');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClass('drive-bridge-status-ok');
	};
	const setError = () => {
		button.setIcon('cloud-off');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClass('drive-bridge-status-error');
	};
	const scheduleCheckConnection = () =>
		(timeout = window.setTimeout(() => void check(), CHECK_CONNECTION_INTERVAL));

	const check = async (force = false) => {
		if (memoryDB.getMeta('lastCheckedFs') === settings.remoteFs && !force) {
			setSuccess();
			return;
		}
		if (!settings.remoteFs) {
			setError();
			return;
		}
		const onFailure = (message: string) => {
			setError();
			log(`Check connection to \`${settings.remoteFs}\` failed: \`${message}\`.`);
			if (force) new Notice(`${translate('checkConnectionFailed')}: ${message}`, 5000);
			else scheduleCheckConnection();
		};

		try {
			setChecking();
			const result = await getCheckConnection()();
			if (result.success) {
				memoryDB.setMeta('lastCheckedFs', settings.remoteFs);
				setSuccess();
				if (force) new Notice(translate('checkConnectionSuccess'));
			} else onFailure(result.reason);
		} catch (error) {
			onFailure(getMessage(error));
		}
	};

	return { check, cleanup: () => window.clearTimeout(timeout) };
}
