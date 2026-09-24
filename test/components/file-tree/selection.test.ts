import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';
import createFileTreeSelection from '@/components/file-tree/selection';
import createFileTreeData from '@/components/file-tree/tree-data';

function makeTask(input: {
	name: TaskNames;
	key: string;
	localIsDir?: boolean;
	remoteIsDir?: boolean;
	prettyName?: string;
}): BaseTask {
	return {
		exec: () => {},
		key: input.key,
		local: input.localIsDir === undefined ? undefined : ({ isDir: input.localIsDir } as never),
		name: input.name,
		prettyName: input.prettyName ?? input.name,
		remote:
			input.remoteIsDir === undefined ? undefined : ({ isDir: input.remoteIsDir } as never),
	} as BaseTask;
}

function createSelection(tasks: Array<BaseTask>) {
	return createFileTreeSelection(createFileTreeData(tasks));
}

test('deselecting child delete task deselects ancestor delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/note.md', name: 'removeLocal' }),
	]);

	selection.toggle('folder/nested/note.md', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/note.md')).toBe(false);
});

test('selecting parent delete task selects descendant delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/note.md', name: 'removeLocal' }),
	]);

	selection.toggle('folder/nested', false);
	selection.toggle('folder', false);
	selection.toggle('folder', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/nested')).toBe(true);
	expect(selection.isSelected('folder/nested/note.md')).toBe(true);
});

test('deselecting create or move folder task deselects descendant create and move tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', name: 'moveLocal', remoteIsDir: true }),
		makeTask({ key: 'folder/nested/deeper', localIsDir: true, name: 'createLocalDir' }),
	]);

	selection.toggle('folder', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/deeper')).toBe(false);
});

test('selecting child create or move task selects ancestor create-folder tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested/deeper', name: 'moveLocal', remoteIsDir: true }),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/nested', false);
	selection.toggle('folder/nested/deeper', false);
	selection.toggle('folder/nested/deeper', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/nested')).toBe(true);
	expect(selection.isSelected('folder/nested/deeper')).toBe(true);
});

test('treats move-folder tasks as creation tasks in mixed cascades', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', name: 'moveLocal', remoteIsDir: true }),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/nested', false);
	selection.toggle('folder/nested', true);
	expect(selection.isSelected('folder')).toBe(true);

	selection.toggle('folder', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
});

test('getState returns selected and deselected task arrays using blueprint names', () => {
	const folder = makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' });
	const file = makeTask({ key: 'folder/note.md', name: 'upload' });
	const selection = createSelection([folder, file]);

	selection.toggle('folder', false);

	expect(selection.getState()).toStrictEqual({
		deselected: [folder, file],
		reversed: [],
		selected: [],
	});
});

test('selecting descendant file task restores required ancestor create-folder tasks', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/note.md', name: 'upload' }),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/note.md', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/note.md')).toBe(true);
});

const undoable = (task: BaseTask) => task.name.startsWith('remove') || task.name === 'upload';
function createReversible(tasks: Array<BaseTask>) {
	return createFileTreeSelection(createFileTreeData(tasks), undoable);
}

test('undoing a task takes it out of the selection and reports it as reversed', () => {
	const upload = makeTask({ key: 'a.md', name: 'upload' });
	const move = makeTask({ key: 'b.md', name: 'moveLocal', remoteIsDir: false });
	const selection = createReversible([upload, move]);
	expect(selection.canReverse('a.md')).toBe(true);
	expect(selection.canReverse('b.md')).toBe(false);
	expect(selection.reverse('b.md', true)).toStrictEqual(new Set());
	expect(selection.reverse('missing', true)).toStrictEqual(new Set());

	expect(selection.reverse('a.md', true)).toStrictEqual(new Set(['a.md']));
	// Asking again changes nothing.
	expect(selection.reverse('a.md', true)).toStrictEqual(new Set());
	expect(selection.isReversed('a.md')).toBe(true);
	expect(selection.isSelected('a.md')).toBe(false);
	expect(selection.getState()).toStrictEqual({
		deselected: [],
		reversed: [upload],
		selected: [move],
	});
});

test('taking the undo back, or ticking the row, runs the task as planned again', () => {
	const selection = createReversible([makeTask({ key: 'a.md', name: 'upload' })]);
	selection.reverse('a.md', true);
	expect(selection.reverse('a.md', false)).toStrictEqual(new Set(['a.md']));
	expect(selection.isSelected('a.md')).toBe(true);
	selection.reverse('a.md', true);
	selection.toggle('a.md', true);
	expect(selection.isReversed('a.md')).toBe(false);
	// Unticking from a cascade leaves the undo in place.
	selection.reverse('a.md', true);
	selection.toggle('a.md', false);
	expect(selection.getState().deselected).toHaveLength(0);
	expect(selection.isReversed('a.md')).toBe(true);
});

test('undoing a deletion inside a deleted folder brings the folders back too', () => {
	const tasks = [
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/note.md', name: 'removeLocal' }),
		makeTask({ key: 'folder/other.md', name: 'removeLocal' }),
	];
	const selection = createReversible(tasks);
	expect(selection.reverse('folder/nested/note.md', true)).toStrictEqual(
		new Set(['folder/nested/note.md', 'folder', 'folder/nested']),
	);
	// A sibling is still deleted.
	expect(selection.isSelected('folder/other.md')).toBe(true);
});

test('undoing a folder deletion brings back everything deleted inside it', () => {
	const selection = createReversible([
		makeTask({ key: 'folder', name: 'removeRemote', remoteIsDir: true }),
		makeTask({ key: 'folder/a.md', name: 'removeRemote', remoteIsDir: false }),
		makeTask({ key: 'folder/b.md', name: 'upload' }),
	]);
	selection.reverse('folder', true);
	expect(selection.isReversed('folder/a.md')).toBe(true);
	// Not a deletion: left as it was.
	expect(selection.isSelected('folder/b.md')).toBe(true);
	// Re-ticking the folder deletes its contents again.
	selection.toggle('folder', true);
	expect(selection.isSelected('folder/a.md')).toBe(true);
	expect(selection.isReversed('folder/a.md')).toBe(false);
});

test('ticking a deletion inside a deleted folder leaves the folder deletion ticked', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/note.md', name: 'removeLocal' }),
	]);
	selection.toggle('folder/note.md', true);
	expect(selection.isSelected('folder')).toBe(true);
});
