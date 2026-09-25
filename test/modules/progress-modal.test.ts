import type { ButtonSpy } from '$/support/modal-spies';
import { ModalSpy, NoticeSpy, SettingSpy, resetSpies, settings } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import testKit from '$/support/test-kit';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { SyncStage } from '@/modules/observability';
import type { TaskInfo } from '@/modules/sync';
import type { BaseTask } from '@/sync';
import type { Progress } from '@/types';
import { ref } from '@/shared/reactive';
import RemoveLocal from '@/sync/tasks/remove-local';
import RemoveRemote from '@/sync/tasks/remove-remote';
import ResolveConflict from '@/sync/tasks/resolve-conflict';
import Upload from '@/sync/tasks/upload';

class ProgressBarSpy {
	value = -1;
	constructor(readonly containerEl: HTMLElement) {}
	setValue(value: number) {
		this.value = value;
		return this;
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	ProgressBarComponent: ProgressBarSpy,
	Setting: SettingSpy,
}));
const { default: ProgressModal } = await import('@/modules/progress-modal');

beforeEach(resetSpies);

const { file, folder, fs } = testKit;
const options = { localFs: fs().fs, record: {} as never, remoteFs: fs().fs };

// Keys come back as they are; a payload is appended as JSON so the tests can read it.
const translate = (key: string, payload?: unknown) =>
	payload === undefined ? key : `${key} ${JSON.stringify(payload)}`;

function setup() {
	const listeners = new Map<string, Set<(payload: unknown) => void>>();
	const dispatched: Array<[string, unknown]> = [];
	const on = (key: string, callback: (payload: unknown) => void) => {
		const set = listeners.get(key) ?? new Set();
		listeners.set(key, set);
		set.add(callback);
		return () => void set.delete(callback);
	};
	const emit = (key: string, payload?: unknown) => {
		for (const callback of listeners.get(key) ?? []) callback(payload);
	};
	const dispatch = (key: string, payload?: unknown) => {
		dispatched.push([key, payload]);
		emit(key, payload);
	};
	const syncStage = ref<SyncStage>('none');
	const walkProgress = ref<Progress>({ completed: 0, total: 0 });
	const executionProgress = ref<Progress<TaskInfo>>({ completed: 0, total: 0 });
	const modal = new ProgressModal({
		app: {} as never,
		dispatch,
		executionProgress,
		on: on as never,
		syncStage,
		translate: translate as never,
		walkProgress,
	});
	const spy = modal as unknown as ModalSpy;
	const el = modal.contentEl;
	const text = (cls: string) => el.querySelector(`.drive-bridge-${cls}`)?.textContent;
	const shown = (cls: string) => el.querySelector<HTMLElement>(`.drive-bridge-${cls}`)?.isShown();
	const events = (key: string) =>
		dispatched.filter(([name]) => name === key).map(([, payload]) => payload);
	return {
		emit,
		events,
		executionProgress,
		listeners,
		modal,
		shown,
		spy,
		syncStage,
		text,
		walkProgress,
	};
}

/** The buttons in the modal right now, by text. */
function visibleButtons(el: HTMLElement): Array<string> {
	return settings
		.filter((row) => el.contains(row.settingEl))
		.flatMap((row) => row.buttons.map((spy) => spy.text));
}

/** The newest button with this text: controls are rebuilt, and the old rows stay recorded. */
function lastButton(text: string): ButtonSpy {
	const found = settings.flatMap((row) => row.buttons).findLast((spy) => spy.text === text);
	if (!found) throw new Error(`No button ${text}`);
	return found;
}

test('a manual sync opens the modal with stop and hide; others stay in the background', () => {
	const { emit, modal, spy, text } = setup();
	emit('syncStarted', { trigger: 'interval' });
	expect(modal.contentEl.childElementCount).toBe(0);
	emit('syncStarted', { trigger: 'manual' });
	expect(spy.title).toBe('syncProgress');
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['stopSync', 'hide']);
	expect(text('progress-description')).toBe('');
	// Execution starting rebuilds the controls rather than adding another row.
	emit('executionStarted', []);
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['stopSync', 'hide']);
});

test('the progress row follows the sync stage', () => {
	const { emit, executionProgress, modal, syncStage, text, walkProgress } = setup();
	const bars: Array<ProgressBarSpy> = [];
	const original = ProgressBarSpy.prototype.setValue;
	ProgressBarSpy.prototype.setValue = function setValue(this: ProgressBarSpy, value: number) {
		bars.push(this);
		return original.call(this, value);
	};
	try {
		emit('syncStarted', { trigger: 'manual' });
		const count = () =>
			modal.contentEl.querySelector<HTMLElement>('.drive-bridge-progress-count');
		const barEl = () =>
			modal.contentEl.querySelector<HTMLElement>('.drive-bridge-progress-bar');
		syncStage('walkingRemote');
		walkProgress({ completed: 3, current: 'notes/', total: 4 });
		expect(text('progress-current')).toBe('walkingRemote notes/');
		expect(text('progress-count')).toBe('3/4 completed');
		expect(bars.at(-1)?.value).toBe(75);

		syncStage('awaitingConfirmation');
		expect(text('progress-current')).toBe('awaitingConfirmation');
		expect(count()?.isShown()).toBe(false);
		expect(barEl()?.isShown()).toBe(false);

		syncStage('executing');
		executionProgress({
			completed: 1,
			current: { isDir: false, key: 'a.md', name: 'upload', prettyName: 'Upload' },
			total: 2,
		});
		expect(text('progress-current')).toBe('upload a.md');
		expect(text('progress-count')).toBe('1/2 completed');
		expect(count()?.isShown()).toBe(true);
		expect(barEl()?.isShown()).toBe(true);
		expect(bars.at(-1)?.value).toBe(50);

		// Once closed, progress no longer reaches the old elements.
		modal.close();
		const updates = bars.length;
		executionProgress({ completed: 2, total: 2 });
		expect(bars).toHaveLength(updates);
	} finally {
		ProgressBarSpy.prototype.setValue = original;
	}
});

test('stop cancels the sync and waits for it to end; hide just closes', async () => {
	const { emit, events, listeners, spy } = setup();
	emit('syncStarted', { trigger: 'manual' });
	let stopped = false;
	const stopping = lastButton('stopSync')
		.click()
		.then(() => {
			stopped = true;
		});
	await Promise.resolve();
	expect(events('syncCanceled')).toHaveLength(1);
	expect(stopped).toBe(false);
	const before = listeners.get('syncTerminated')?.size ?? 0;
	emit('syncTerminated');
	await stopping;
	expect(stopped).toBe(true);
	// The one-off wait unsubscribes itself.
	expect(listeners.get('syncTerminated')?.size).toBe(before - 1);

	await lastButton('hide').click();
	expect(spy.closed).toBe(true);
	expect(spy.contentEl.childElementCount).toBe(0);
});

test('a finished sync without failures offers done', async () => {
	const { emit, modal, spy } = setup();
	// Closed: nothing to show.
	emit('syncTerminated');
	expect(modal.contentEl.childElementCount).toBe(0);
	emit('syncStarted', { trigger: 'manual' });
	emit('syncTerminated');
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['done']);
	await lastButton('done').click();
	expect(spy.closed).toBe(true);
});

test('failed tasks open the modal and are listed once', () => {
	const { emit, modal, shown, text } = setup();
	const failure = {
		error: 'Quota exceeded',
		isDir: false,
		key: 'a.md',
		name: 'upload',
		prettyName: 'Upload',
	};
	emit('taskFailed', failure);
	emit('taskFailed', { ...failure, key: 'b.md' });
	emit('syncTerminated');
	expect(text('progress-description')).toBe('failedTasksDescription 2');
	expect(shown('progress-description')).toBe(true);
	expect(shown('progress-details')).toBe(true);
	const paths = [...modal.contentEl.querySelectorAll('.drive-bridge-failed-task-path')];
	expect(paths.map((el) => el.textContent)).toStrictEqual(['a.md', 'b.md']);
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['done']);

	// The list starts over for the next sync; an open modal keeps its place.
	modal.close();
	emit('syncStarted', { trigger: 'manual' });
	emit('taskFailed', { ...failure, key: 'c.md' });
	emit('syncTerminated');
	const again = [...modal.contentEl.querySelectorAll('.drive-bridge-failed-task-path')];
	expect(again.map((el) => el.textContent)).toStrictEqual(['c.md']);
	expect(text('progress-description')).toBe('failedTasksDescription 1');
});

function planned(): Array<BaseTask> {
	return [
		new Upload({
			...options,
			key: 'changed.md',
			local: file('changed.md'),
			remote: file('changed.md'),
		}),
		new Upload({ ...options, key: 'new.md', local: file('new.md') }),
		new RemoveLocal({ ...options, key: 'here.md', local: file('here.md') }),
		new RemoveRemote({ ...options, key: 'gone/', remote: folder('gone/') }),
		new ResolveConflict({
			...options,
			key: 'both.md',
			local: file('both.md'),
			remote: file('both.md'),
			resolver: () => {},
		}),
	];
}

function treeRow(el: HTMLElement, label: string) {
	return [...el.querySelectorAll<HTMLElement>('.drive-bridge-file-tree-row')].find((candidate) =>
		candidate.querySelector('.drive-bridge-file-tree-label')?.textContent?.startsWith(label),
	) as HTMLElement;
}

test('confirming planned tasks sends the ticked ones plus the reverse of undone ones', async () => {
	const { emit, events, modal, shown, spy, text } = setup();
	const tasks = planned();
	emit('requestConfirmTasks', tasks);
	expect(text('progress-description')).toBe(
		`confirmTasksDescription ${JSON.stringify({ conflict: 1, deleteLocal: 1, deleteRemote: 1, total: 5 })}`,
	);
	expect(shown('progress-details')).toBe(true);
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['cancel', 'confirm']);
	treeRow(modal.contentEl, 'new.md').click();
	treeRow(modal.contentEl, 'changed.md')
		.querySelector<HTMLElement>('.drive-bridge-file-tree-undo')
		?.click();
	await lastButton('confirm').click();

	const [confirmed] = events('tasksConfirmed') as Array<Array<BaseTask>>;
	expect(confirmed?.map(({ key, name }) => `${name} ${key}`)).toStrictEqual([
		'removeLocal here.md',
		'removeRemote gone/',
		'resolveConflict both.md',
		'download changed.md',
	]);
	expect(shown('progress-details')).toBe(false);
	expect(modal.contentEl.querySelector('.drive-bridge-file-tree')).toBeNull();
	// Confirming is not cancelling, even when the modal closes later.
	modal.close();
	expect(events('syncCanceled')).toHaveLength(0);
	expect(spy.closed).toBe(true);
});

test('cancelling the planned tasks, or closing the modal, cancels the sync', async () => {
	const { emit, events, modal } = setup();
	emit('syncStarted', { trigger: 'manual' });
	emit('requestConfirmTasks', planned());
	await lastButton('cancel').click();
	expect(events('syncCanceled')).toHaveLength(1);
	expect(events('tasksConfirmed')).toHaveLength(0);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('confirming deletions splits them into deleted and uploaded again, then closes', async () => {
	const { emit, events, modal, spy, text } = setup();
	const tasks = [
		new RemoveLocal({ ...options, key: 'a.md', local: file('a.md') }),
		new RemoveLocal({ ...options, key: 'b.md', local: file('b.md') }),
	];
	emit('requestConfirmDelete', tasks);
	expect(text('progress-description')).toBe('confirmDeleteDescription 2');
	treeRow(modal.contentEl, 'b.md').click();
	await lastButton('confirm').click();
	expect(events('deleteConfirmed')).toStrictEqual([{ delete: [tasks[0]], reupload: [tasks[1]] }]);
	expect(spy.closed).toBe(true);
	expect(events('syncCanceled')).toHaveLength(0);
});

test('when the modal was already open, confirming deletions keeps it open', async () => {
	const { emit, events, modal, spy } = setup();
	emit('syncStarted', { trigger: 'manual' });
	const task = new RemoveLocal({ ...options, key: 'a.md', local: file('a.md') });
	emit('requestConfirmDelete', [task]);
	await lastButton('confirm').click();
	expect(events('deleteConfirmed')).toStrictEqual([{ delete: [task], reupload: [] }]);
	expect(spy.closed).toBe(false);
	expect(modal.contentEl.querySelector('.drive-bridge-progress-modal')).not.toBeNull();
});

test('a mass deletion asks first, and only deleting says yes', async () => {
	const { emit, events } = setup();
	emit('requestConfirmMassDelete', { local: 3, remote: 4 });
	await lastButton('deleteThem').click();
	emit('requestConfirmMassDelete', { local: 3, remote: 4 });
	await lastButton('keepThem').click();
	expect(events('massDeleteConfirmed')).toStrictEqual([true, false]);
});

test('a mass change asks first, and only continuing says yes', async () => {
	const { emit, events } = setup();
	emit('requestConfirmMassChange', { changes: 50, percent: 60 });
	await lastButton('continueSync').click();
	emit('requestConfirmMassChange', { changes: 50, percent: 60 });
	await lastButton('stopSync').click();
	expect(events('massChangeConfirmed')).toStrictEqual([true, false]);
});

test('the root hooks show and hide the progress', () => {
	const { modal, spy } = setup();
	modal.root.showProgress();
	expect(visibleButtons(modal.contentEl)).toStrictEqual(['stopSync', 'hide']);
	modal.root.hideProgress();
	expect(spy.closed).toBe(true);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('dispose closes the modal and stops listening', () => {
	const { emit, listeners, modal } = setup();
	emit('syncStarted', { trigger: 'manual' });
	modal.dispose();
	expect(modal.contentEl.childElementCount).toBe(0);
	expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
	emit('syncStarted', { trigger: 'manual' });
	expect(modal.contentEl.childElementCount).toBe(0);
});
