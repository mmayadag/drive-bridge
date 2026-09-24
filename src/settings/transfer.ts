// Settings export and import. Settings travel as plain JSON; module secrets (the Google
// client secret and refresh token) only travel sealed with a passphrase, or not at all.

import { open, seal } from '@/shared/secret-box';

const FORMAT = 'drive-bridge-settings';
const VERSION = 1;

/** Per-device state that is not a preference and never travels. */
const DEVICE_STATE = new Set(['lastSync', 'skipState', 'keptOnRemote', 'syncHistory']);

/** Secrets by module id, then by name. */
export type ModuleSecrets = Record<string, Record<string, string>>;

export type Transfer = {
	format: typeof FORMAT;
	version: typeof VERSION;
	exported: string;
	settings: Record<string, unknown>;
	/** `seal`ed JSON of ModuleSecrets. */
	secrets?: string;
};

type SettingsLike = Record<string, unknown> & { modules: Record<string, object> };

export async function buildTransfer(
	settings: SettingsLike,
	secrets: ModuleSecrets,
	passphrase?: string,
	now = new Date(),
): Promise<Transfer> {
	const copy: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(settings))
		if (!DEVICE_STATE.has(key)) copy[key] = structuredClone(value);
	const hasSecrets = Object.values(secrets).some((values) => Object.keys(values).length);
	return {
		exported: now.toISOString(),
		format: FORMAT,
		settings: copy,
		version: VERSION,
		...(passphrase && hasSecrets
			? { secrets: await seal(JSON.stringify(secrets), passphrase) }
			: {}),
	};
}

/** Undefined when the text is not a Drive Bridge settings export. */
export function parseTransfer(text: string): Transfer | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	const transfer = parsed as Partial<Transfer> | undefined;
	if (transfer?.format !== FORMAT || transfer.version !== VERSION) return;
	if (!transfer.settings || typeof transfer.settings !== 'object') return;
	return transfer as Transfer;
}

export async function openSecrets(transfer: Transfer, passphrase: string) {
	if (!transfer.secrets) return {};
	return JSON.parse(await open(transfer.secrets, passphrase)) as ModuleSecrets;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The settings an import would change, as `key` or `module.key`. */
export function changedSettings(current: SettingsLike, incoming: Record<string, unknown>) {
	const changed: Array<string> = [];
	for (const [key, value] of Object.entries(incoming)) {
		if (DEVICE_STATE.has(key) || !(key in current)) continue;
		if (key !== 'modules') {
			if (!same(current[key], value)) changed.push(key);
			continue;
		}
		for (const [id, values] of Object.entries((value ?? {}) as Record<string, object>)) {
			// A module this device does not have gets nothing, so nothing changes.
			const target = current.modules[id] as Record<string, unknown> | undefined;
			if (!target) continue;
			for (const [name, setting] of Object.entries(values))
				if (!same(target[name], setting)) changed.push(`${id}.${name}`);
		}
	}
	return changed;
}

/**
 * Copies imported settings over the current ones. Device state stays, and keys this device
 * does not know are ignored. Module settings are assigned into the existing objects, which
 * the running modules hold on to.
 */
export function applySettings(current: SettingsLike, incoming: Record<string, unknown>) {
	for (const [key, value] of Object.entries(incoming)) {
		if (DEVICE_STATE.has(key) || !(key in current)) continue;
		if (key !== 'modules') {
			current[key] = structuredClone(value);
			continue;
		}
		for (const [id, values] of Object.entries((value ?? {}) as Record<string, object>)) {
			const target = current.modules[id] as Record<string, unknown> | undefined;
			if (!target) continue;
			for (const [name, setting] of Object.entries(values))
				if (name in target) target[name] = structuredClone(setting);
		}
	}
}
