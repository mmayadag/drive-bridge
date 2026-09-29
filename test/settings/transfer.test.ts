import { expect, test } from 'bun:test';
import {
	applySettings,
	buildTransfer,
	changedSettings,
	openSecrets,
	parseTransfer,
} from '@/settings/transfer';

const current = () => ({
	decider: 'bidirectional',
	exclusionRules: [{ caseSensitive: false, expr: '.git' }],
	keptOnRemote: { 'a.md': 'r1' },
	lastExport: { at: 2, path: 'x.json' },
	lastSync: { at: 1, result: 'completed' },
	modules: { gdrive: { baseDirectory: 'vault/', clientId: 'id', useTrash: true } },
	skipState: { failures: {}, skipped: ['bad.md'] },
});

test('an export leaves out device state and seals the secrets', async () => {
	const transfer = await buildTransfer(
		current(),
		{ gdrive: { clientSecret: 'shh', refreshToken: '1//tok' } },
		'pass phrase',
		{ now: new Date(0) },
	);
	expect(Object.keys(transfer.settings).toSorted()).toStrictEqual([
		'decider',
		'exclusionRules',
		'modules',
	]);
	const text = JSON.stringify(transfer);
	expect(text).not.toContain('shh');
	expect(text).not.toContain('1//tok');
	expect(parseTransfer(text)).toStrictEqual(transfer);
	expect(await openSecrets(transfer, 'pass phrase')).toStrictEqual({
		gdrive: { clientSecret: 'shh', refreshToken: '1//tok' },
	});
});

test('without a passphrase the secrets are left out', async () => {
	const transfer = await buildTransfer(current(), { gdrive: { clientSecret: 'shh' } });
	expect(transfer.secrets).toBeUndefined();
	expect(await openSecrets(transfer, 'anything')).toStrictEqual({});
});

test('only Drive Bridge exports are accepted', () => {
	expect(parseTransfer('{"format":"other","version":1,"settings":{}}')).toBeUndefined();
	expect(parseTransfer('not json')).toBeUndefined();
});

test('an import changes preferences and keeps device state and live module objects', () => {
	const settings = current();
	const gdrive = settings.modules.gdrive;
	const incoming = {
		decider: 'mirrorLocal',
		keptOnRemote: {},
		lastSync: undefined,
		modules: {
			gdrive: { baseDirectory: 'other/', clientId: 'id', useTrash: false },
			unknown: { x: 1 },
		},
	};
	expect(changedSettings(settings, incoming)).toStrictEqual([
		'decider',
		'gdrive.baseDirectory',
		'gdrive.useTrash',
	]);
	applySettings(settings, incoming);
	expect(settings.decider).toBe('mirrorLocal');
	expect(settings.modules.gdrive).toBe(gdrive);
	expect(gdrive).toStrictEqual({ baseDirectory: 'other/', clientId: 'id', useTrash: false });
	expect(settings.keptOnRemote).toStrictEqual({ 'a.md': 'r1' });
	expect(settings.lastSync).toStrictEqual({ at: 1, result: 'completed' });
	expect('unknown' in settings.modules).toBe(false);
	expect('unknownKey' in settings).toBe(false);
	expect('injected' in gdrive).toBe(false);
});

const RULES = [{ caseSensitive: false, expr: '.git' }];
const defaults = {
	modules: { gdrive: { remoteScan: 'changes', useTrash: true } },
	settings: { decider: 'bidirectional', exclusionRules: RULES, neverDeleteRemote: true },
};

test('an export carries only what differs from the defaults', async () => {
	const settings = {
		...current(),
		exclusionRules: RULES,
		modules: {
			gdrive: { baseDirectory: 'vault/', clientId: 'id', remoteScan: 'full', useTrash: true },
			'smart-merge': {},
		},
		neverDeleteRemote: false,
	};
	const { settings: exported } = await buildTransfer(settings, {}, undefined, { defaults });
	expect(exported).toStrictEqual({
		// The folder and client always travel; only preferences can be left out.
		modules: { gdrive: { baseDirectory: 'vault/', clientId: 'id', remoteScan: 'full' } },
		neverDeleteRemote: false,
	});
});

test('an import sets what the file leaves out back to its default', () => {
	const settings = {
		...current(),
		decider: 'mirrorLocal',
		exclusionRules: [] as typeof RULES,
		modules: {
			gdrive: { baseDirectory: 'mine/', clientId: 'id', remoteScan: 'full', useTrash: false },
		},
		neverDeleteRemote: false,
	};
	const incoming = { modules: { gdrive: { baseDirectory: 'vault/' } } };
	expect(changedSettings(settings, incoming, defaults)).toStrictEqual([
		'decider',
		'exclusionRules',
		'neverDeleteRemote',
		'gdrive.remoteScan',
		'gdrive.useTrash',
		'gdrive.baseDirectory',
	]);
	applySettings(settings, incoming, defaults);
	expect(settings.decider).toBe('bidirectional');
	expect(settings.exclusionRules).toStrictEqual(RULES);
	expect(settings.neverDeleteRemote).toBe(true);
	// A module setting with no default (the client) is kept when the file leaves it out.
	expect(settings.modules.gdrive).toStrictEqual({
		baseDirectory: 'vault/',
		clientId: 'id',
		remoteScan: 'changes',
		useTrash: true,
	});
	expect(settings.keptOnRemote).toStrictEqual({ 'a.md': 'r1' });
});

test('an empty list is a choice, not a default', async () => {
	const settings = { ...current(), exclusionRules: [] as typeof RULES };
	const { settings: exported } = await buildTransfer(settings, {}, undefined, { defaults });
	expect(exported.exclusionRules).toStrictEqual([]);
	const target = { ...current(), exclusionRules: RULES };
	applySettings(target, exported, defaults);
	expect(target.exclusionRules).toStrictEqual([]);
});

test('an older export that carries every key imports as before', () => {
	const settings = { ...current(), neverDeleteRemote: true };
	const incoming = { decider: 'mirrorLocal', exclusionRules: RULES, neverDeleteRemote: false };
	applySettings(settings, incoming, defaults);
	expect(settings.decider).toBe('mirrorLocal');
	expect(settings.neverDeleteRemote).toBe(false);
});
