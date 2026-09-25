import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import mountFileTree from '@/components/file-tree';
import RemoveRemote from '@/sync/tasks/remove-remote';
import Upload from '@/sync/tasks/upload';

const { file, folder, fs } = testKit;
const options = { localFs: fs().fs, record: {} as never, remoteFs: fs().fs };
const translate = ((key: string, count?: number) =>
	count === undefined ? key : `${key} ${count}`) as never;

function mount(undo: boolean) {
	const el = document.createElement('div');
	const tasks = [
		new Upload({
			...options,
			key: 'changed.md',
			local: file('changed.md'),
			remote: file('changed.md'),
		}),
		new Upload({ ...options, key: 'new.md', local: file('new.md') }),
		new RemoveRemote({ ...options, key: 'gone/', remote: folder('gone/') }),
		new RemoveRemote({ ...options, key: 'gone/a.md', remote: file('gone/a.md') }),
	];
	const tree = mountFileTree(el, tasks, translate, { undo });
	const rows = [...el.querySelectorAll<HTMLElement>('.drive-bridge-file-tree-row')];
	const row = (label: string) =>
		rows.find((candidate) =>
			candidate
				.querySelector('.drive-bridge-file-tree-label')
				?.textContent?.startsWith(label),
		) as HTMLElement;
	const undoButton = (label: string) =>
		row(label).querySelector<HTMLElement>('.drive-bridge-file-tree-undo');
	const count = () => el.querySelector('.drive-bridge-file-tree-count')?.textContent;
	return { count, el, row, tasks, tree, undoButton };
}

test('without undo, no row has the button', () => {
	const { el } = mount(false);
	expect(el.querySelectorAll('.drive-bridge-file-tree-undo')).toHaveLength(0);
});

test('only rows with another side to keep get an undo button', () => {
	const { undoButton } = mount(true);
	expect(undoButton('changed.md')?.getAttribute('aria-label')).toBe('undoUpload');
	expect(undoButton('new.md')).toBeNull();
	expect(undoButton('gone')?.getAttribute('aria-label')).toBe('undoRemoveRemote');
});

test('undo marks the row, keeps it counted and hands back the task to reverse', () => {
	const { count, row, tasks, tree, undoButton } = mount(true);
	expect(count()).toBe('xSelected 4');
	undoButton('changed.md')?.click();
	const label = row('changed.md').querySelector('.drive-bridge-file-tree-label');
	expect(label?.classList.contains('is-reversed')).toBe(true);
	expect(label?.classList.contains('is-deselected')).toBe(false);
	expect(undoButton('changed.md')?.classList.contains('is-active')).toBe(true);
	expect(row('changed.md').querySelector('input')?.checked).toBe(false);
	expect(count()).toBe('xSelected 4');
	expect(tree.getState().reversed).toStrictEqual([tasks[0]]);

	// A second press takes the undo back.
	undoButton('changed.md')?.click();
	expect(tree.getState().reversed).toStrictEqual([]);
	expect(row('changed.md').querySelector('input')?.checked).toBe(true);
});

test('undoing a file in a deleted folder brings the folder back as well', () => {
	const { tasks, tree, undoButton } = mount(true);
	undoButton('a.md')?.click();
	expect(tree.getState().reversed).toStrictEqual([tasks[2], tasks[3]]);
});

test('clicking the row itself still ticks and unticks it', () => {
	const { count, row, tree } = mount(true);
	row('new.md').click();
	expect(count()).toBe('xSelected 3');
	expect(tree.getState().deselected.map((task) => task.key)).toStrictEqual(['new.md']);
});

test('select all unticks everything, then ticks everything', () => {
	const { count, el, tree } = mount(true);
	const header = el.querySelector<HTMLElement>('.drive-bridge-file-tree-row');
	header?.click();
	expect(count()).toBe('xSelected 0');
	header?.click();
	expect(tree.getState().selected).toHaveLength(4);
});

test('unmount removes the tree', () => {
	const { el, tree } = mount(false);
	tree.unmount();
	expect(el.querySelector('.drive-bridge-file-tree')).toBeNull();
});
