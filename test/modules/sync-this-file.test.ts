import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const notices: Array<string> = [];
void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: function Notice(message: string) {
		notices.push(message);
	},
}));
const { TFile, TFolder } = await import('obsidian');
const { registerSyncThisFile } = await import('@/modules/sync-this-file');
const { ref } = await import('@/shared/reactive');

type Handler = (...args: Array<unknown>) => void;

function setup(result = 'completed') {
	notices.length = 0;
	const note = Object.assign(new TFile(), { path: 'notes/a.md' });
	const handlers = new Map<string, Handler>();
	const commands: Array<{ checkCallback: (checking: boolean) => boolean }> = [];
	const runs: Array<unknown> = [];
	const actions: Array<() => void> = [];
	let active: unknown = note;
	const view = {
		addAction: (_icon: string, _title: string, run: () => void) => actions.push(run),
		getViewType: () => 'markdown',
	};
	let leaf: unknown = { view };
	const isIdle = ref(true);
	registerSyncThisFile({
		addCommand: (command) => {
			commands.push(command as never);
			return command;
		},
		app: {
			workspace: {
				getActiveFile: () => active,
				getMostRecentLeaf: () => leaf,
				on: (name: string, fn: Handler) => {
					handlers.set(name, fn);
					return {};
				},
				onLayoutReady: (fn: () => void) => fn(),
			},
		} as never,
		executeSync: (trigger, options) => {
			runs.push({ options, trigger });
			return Promise.resolve({ result } as never);
		},
		isIdle,
		registerEvent: () => {},
		translate: ((key: string) => key) as never,
	});
	return {
		actions,
		command: commands[0],
		handlers,
		isIdle,
		note,
		runs,
		setActive: (file: unknown) => (active = file),
		setLeaf: (next: unknown) => (leaf = next),
	};
}

const flush = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

test('the command syncs only the open note and says so', async () => {
	const { command, runs } = setup();
	expect(command.checkCallback(true)).toBe(true);
	expect(runs).toHaveLength(0);
	command.checkCallback(false);
	await flush();
	expect(runs).toStrictEqual([{ options: { only: 'notes/a.md' }, trigger: 'file' }]);
	expect(notices).toStrictEqual(['fileSynced notes/a.md']);
});

test('the command is unavailable with no open note or while a sync runs', () => {
	const { command, isIdle, setActive } = setup();
	isIdle(false);
	expect(command.checkCallback(true)).toBe(false);
	isIdle(true);
	setActive(undefined);
	expect(command.checkCallback(true)).toBe(false);
});

test('a failed or cancelled sync shows no success notice', async () => {
	const { command } = setup('failed');
	command.checkCallback(false);
	await flush();
	expect(notices).toStrictEqual([]);
});

test('the file menu offers it for files, not folders', async () => {
	const { handlers, runs, note } = setup('noop');
	const items: Array<{ run?: () => void }> = [];
	const menu = {
		addItem: (build: (item: unknown) => void) => {
			const entry: { run?: () => void } = {};
			const item = {
				onClick: (run: () => void) => {
					entry.run = run;
					return item;
				},
				setIcon: () => item,
				setTitle: () => item,
			};
			build(item);
			items.push(entry);
		},
	};
	handlers.get('file-menu')?.(menu, new TFolder());
	expect(items).toHaveLength(0);
	handlers.get('file-menu')?.(menu, note);
	items[0]?.run?.();
	await flush();
	expect(runs).toHaveLength(1);
	expect(notices).toStrictEqual(['fileSynced notes/a.md']);
});

test('each note view gets one header button, which syncs the open note', async () => {
	const { actions, handlers, isIdle, runs, setActive, setLeaf } = setup();
	// Added once on layout ready; switching back to the same view adds nothing.
	handlers.get('active-leaf-change')?.();
	expect(actions).toHaveLength(1);
	setLeaf({ view: { getViewType: () => 'canvas' } });
	handlers.get('active-leaf-change')?.();
	setLeaf(undefined);
	handlers.get('active-leaf-change')?.();
	expect(actions).toHaveLength(1);

	actions[0]?.();
	await flush();
	expect(runs).toHaveLength(1);
	// Busy, or no note open: nothing runs.
	isIdle(false);
	actions[0]?.();
	isIdle(true);
	setActive(undefined);
	actions[0]?.();
	await flush();
	expect(runs).toHaveLength(1);
});
