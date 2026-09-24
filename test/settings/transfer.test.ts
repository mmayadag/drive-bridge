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
	lastSync: { at: 1, result: 'completed' },
	modules: { gdrive: { baseDirectory: 'vault/', clientId: 'id', useTrash: true } },
	skipState: { failures: {}, skipped: ['bad.md'] },
});

test('an export leaves out device state and seals the secrets', async () => {
	const transfer = await buildTransfer(
		current(),
		{ gdrive: { clientSecret: 'shh', refreshToken: '1//tok' } },
		'pass phrase',
		new Date(0),
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
