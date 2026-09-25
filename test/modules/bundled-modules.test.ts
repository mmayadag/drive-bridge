// The bundled modules loader: adds Google Drive and Smart merge to the context, keeps their
// settings under `modules`, and fans reset, secret export and secret import out to them.

import { expect, test } from 'bun:test';
import type { ModuleInstance } from '@/modules/bundled-modules';
import Gdrive from '@/gdrive';
import BundledModules from '@/modules/bundled-modules';
import SmartMerge from '@/smart-merge';

type FakeInstance = ModuleInstance & { resets: number };

function setup(modules: Record<string, object> = {}) {
	const instances = new Map<unknown, FakeInstance>([
		[
			Gdrive,
			{
				moduleSettings: { clientId: '', useTrash: true },
				resetSettings() {
					this.resets++;
				},
				resets: 0,
				secrets: {
					export: () => ({ refreshToken: '1//token' }),
					import: (values) =>
						Promise.resolve(`gdrive got ${Object.keys(values).join(',')}`),
				},
			},
		],
		// No secrets and nothing to reset.
		[SmartMerge, { moduleSettings: { conflictAStart: '<<<' }, resets: 0 }],
	]);
	const added: Array<unknown> = [];
	const dispatched: Array<[string, unknown]> = [];
	const allModules = new Set<unknown>();
	let saves = 0;
	const ctx = {
		__addModule__: (ctor: unknown) => void added.push(ctor),
		__getModule__: (ctor: unknown) => instances.get(ctor),
		allModules,
		dispatch: (name: string, payload: unknown) => void dispatched.push([name, payload]),
		saveSettings: () => Promise.resolve(void saves++),
	};
	const bundled = new BundledModules(ctx as never);
	const settings = { modules };
	Object.assign(bundled, { settings });
	return {
		added,
		allModules,
		bundled,
		dispatched,
		instances,
		saves: () => saves,
		settings,
	};
}

test('loadAllModules adds each bundled module and stores its settings under modules', () => {
	const { bundled, added, allModules, dispatched, instances, saves, settings } = setup({
		gdrive: { clientId: 'saved-client' },
	});
	bundled.root.loadAllModules();
	expect(added).toEqual([Gdrive, SmartMerge]);
	expect([...allModules]).toEqual([Gdrive, SmartMerge]);
	expect(dispatched).toEqual([
		['moduleLoaded', 'gdrive'],
		['moduleLoaded', 'smart-merge'],
	]);
	// Saved values are merged into the live settings object, which then is what is saved.
	const gdrive = instances.get(Gdrive);
	expect(gdrive?.moduleSettings).toEqual({ clientId: 'saved-client', useTrash: true });
	expect(settings.modules.gdrive).toBe(gdrive?.moduleSettings as object);
	expect(settings.modules['smart-merge']).toBe(
		instances.get(SmartMerge)?.moduleSettings as object,
	);
	expect([...bundled.root.loadedModules.keys()]).toEqual(['gdrive', 'smart-merge']);
	expect(saves()).toBe(1);
});

test('resetModuleSettings resets the modules that can reset', () => {
	const { bundled, instances } = setup();
	bundled.root.loadAllModules();
	bundled.root.resetModuleSettings();
	expect(instances.get(Gdrive)?.resets).toBe(1);
	expect(instances.get(SmartMerge)?.resets).toBe(0);
});

test('exportModuleSecrets collects the secrets of modules that have some', () => {
	const { bundled } = setup();
	expect(bundled.root.exportModuleSecrets()).toStrictEqual({});
	bundled.root.loadAllModules();
	expect(bundled.root.exportModuleSecrets()).toStrictEqual({
		gdrive: { refreshToken: '1//token' },
	});
});

test('importModuleSecrets hands each module its own secrets and returns their lines', async () => {
	const { bundled } = setup();
	bundled.root.loadAllModules();
	expect(
		await bundled.root.importModuleSecrets({
			gdrive: { clientSecret: 'secret', refreshToken: '1//token' },
			// A module without secrets ignores what an export carried for it.
			'smart-merge': { anything: 'value' },
		}),
	).toEqual(['gdrive got clientSecret,refreshToken']);
	expect(await bundled.root.importModuleSecrets({})).toEqual([]);
});

test('importModuleSecrets leaves out modules that report nothing', async () => {
	const { bundled, instances } = setup();
	bundled.root.loadAllModules();
	const gdrive = instances.get(Gdrive);
	if (gdrive?.secrets) gdrive.secrets.import = () => Promise.resolve('');
	expect(await bundled.root.importModuleSecrets({ gdrive: { clientSecret: 'x' } })).toEqual([]);
});

test('dispose forgets the loaded modules', () => {
	const { bundled } = setup();
	bundled.root.loadAllModules();
	bundled.dispose();
	expect(bundled.root.loadedModules.size).toBe(0);
	expect(bundled.root.exportModuleSecrets()).toStrictEqual({});
});
