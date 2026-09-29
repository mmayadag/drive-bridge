// Settings export and import. Settings travel as plain JSON; module secrets (the Google
// client secret and refresh token) only travel sealed with a passphrase, or not at all.
// An export carries only what differs from the defaults; a setting it leaves out goes
// back to its default on import, so both devices end up the same.

import { open, seal } from '@/shared/secret-box';

const FORMAT = 'drive-bridge-settings';
const VERSION = 1;

/** Per-device state that is not a preference and never travels. */
const DEVICE_STATE = new Set([
	'lastSync',
	'skipState',
	'keptOnRemote',
	'syncHistory',
	'lastExport',
]);

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

/**
 * The defaults a setting is left out at. Module settings without a default here (what
 * ties a device to its Drive: folder, client, account) always travel.
 */
export type TransferDefaults = {
	settings: Record<string, unknown>;
	modules: Record<string, Record<string, unknown>>;
};

const NO_DEFAULTS: TransferDefaults = { modules: {}, settings: {} };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function withoutDefaults(values: object, defaults: Record<string, unknown>) {
	const copy: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values))
		if (!(key in defaults) || !same(value, defaults[key])) copy[key] = structuredClone(value);
	return copy;
}

/** What the import sets each key to: the exported value, or its default when left out. */
function incomingValues(
	incoming: Record<string, unknown>,
	defaults: Record<string, unknown>,
): Record<string, unknown> {
	return { ...defaults, ...incoming };
}

export async function buildTransfer(
	settings: SettingsLike,
	secrets: ModuleSecrets,
	passphrase?: string,
	{ now = new Date(), defaults = NO_DEFAULTS }: { now?: Date; defaults?: TransferDefaults } = {},
): Promise<Transfer> {
	const copy: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(settings)) {
		if (DEVICE_STATE.has(key)) continue;
		if (key === 'modules') {
			const modules: Record<string, object> = {};
			for (const [id, values] of Object.entries(value as Record<string, object>)) {
				const changed = withoutDefaults(values, defaults.modules[id] ?? {});
				if (Object.keys(changed).length) modules[id] = changed;
			}
			if (Object.keys(modules).length) copy.modules = modules;
		} else if (!(key in defaults.settings) || !same(value, defaults.settings[key]))
			copy[key] = structuredClone(value);
	}
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

/** The settings an import would change, as `key` or `module.key`. */
export function changedSettings(
	current: SettingsLike,
	incoming: Record<string, unknown>,
	defaults = NO_DEFAULTS,
) {
	const changed: Array<string> = [];
	for (const [key, value] of Object.entries(incomingValues(incoming, defaults.settings))) {
		if (DEVICE_STATE.has(key) || !(key in current) || key === 'modules') continue;
		if (!same(current[key], value)) changed.push(key);
	}
	const modules = (incoming.modules ?? {}) as Record<string, Record<string, unknown>>;
	for (const [id, target] of Object.entries(current.modules) as Array<
		[string, Record<string, unknown>]
	>) {
		// A module this device does not have gets nothing, so nothing changes.
		const values = incomingValues(modules[id] ?? {}, defaults.modules[id] ?? {});
		for (const [name, setting] of Object.entries(values))
			if (name in target && !same(target[name], setting)) changed.push(`${id}.${name}`);
	}
	return changed;
}

/**
 * Copies imported settings over the current ones. Device state stays, and keys this device
 * does not know are ignored. Module settings are assigned into the existing objects, which
 * the running modules hold on to.
 */
export function applySettings(
	current: SettingsLike,
	incoming: Record<string, unknown>,
	defaults = NO_DEFAULTS,
) {
	for (const [key, value] of Object.entries(incomingValues(incoming, defaults.settings))) {
		if (DEVICE_STATE.has(key) || !(key in current) || key === 'modules') continue;
		current[key] = structuredClone(value);
	}
	const modules = (incoming.modules ?? {}) as Record<string, Record<string, unknown>>;
	for (const [id, target] of Object.entries(current.modules) as Array<
		[string, Record<string, unknown>]
	>) {
		const values = incomingValues(modules[id] ?? {}, defaults.modules[id] ?? {});
		for (const [name, setting] of Object.entries(values))
			if (name in target) target[name] = structuredClone(setting);
	}
}
