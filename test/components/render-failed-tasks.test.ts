import { expect, test } from 'bun:test';
import renderFailedTasks from '@/components/render-failed-tasks';

const failed = [
	{
		error: 'Quota exceeded',
		isDir: false,
		key: 'notes/a.md',
		name: 'upload',
		prettyName: 'Upload',
	},
	{ error: 'Not found', isDir: true, key: 'old/', name: 'removeLocal', prettyName: 'Delete' },
] as const;

test('lists each failed task with its type, path and error, replacing what was there', () => {
	const container = document.createElement('div');
	container.createEl('p', { text: 'stale' });
	container.hide();
	renderFailedTasks(container, [...failed]);
	expect(container.isShown()).toBe(true);
	expect(container.textContent).not.toContain('stale');
	const list = container.querySelector('.drive-bridge-failed-tasks') as HTMLElement;
	expect(container.children).toHaveLength(1);
	const rows = [...list.children];
	expect(rows).toHaveLength(2);
	const read = (row: Element, cls: string) =>
		row.querySelector(`.drive-bridge-${cls}`)?.textContent;
	expect(rows.map((row) => read(row, 'failed-task-type'))).toStrictEqual(['Upload', 'Delete']);
	expect(rows.map((row) => read(row, 'failed-task-path'))).toStrictEqual(['notes/a.md', 'old/']);
	expect(rows.map((row) => read(row, 'failed-task-error'))).toStrictEqual([
		'Quota exceeded',
		'Not found',
	]);
	const icon = rows[0]?.querySelector('.drive-bridge-failed-task-icon');
	expect(icon?.classList.contains('drive-bridge-task-icon')).toBe(true);
	expect(icon?.querySelectorAll('svg')).toHaveLength(2);
});

test('with nothing failed, the list is empty', () => {
	const container = document.createElement('div');
	renderFailedTasks(container, []);
	expect(container.querySelector('.drive-bridge-failed-tasks')?.childElementCount).toBe(0);
});
