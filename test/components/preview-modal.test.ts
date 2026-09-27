import { ModalSpy, NoticeSpy, SettingSpy, button, resetSpies } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import testKit from '$/support/test-kit';
import { beforeEach, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: SettingSpy,
}));
const { default: PreviewModal } = await import('@/components/preview-modal');
const { default: Upload } = await import('@/sync/tasks/upload');

const { file, fs } = testKit;
const translate = ((key: string) => key) as never;

beforeEach(resetSpies);

test('shows the plan read-only, and Done closes it', () => {
	const task = new Upload({
		key: 'a.md',
		local: file('a.md'),
		localFs: fs().fs,
		record: {} as never,
		remoteFs: fs().fs,
	});
	const modal = new PreviewModal({} as never, {
		description: 'If you sync now: 1 operation',
		done: 'Done',
		tasks: [task],
		title: 'Sync preview',
		translate,
	});
	modal.open();
	expect((modal as unknown as ModalSpy).title).toBe('Sync preview');
	expect(modal.contentEl.textContent).toContain('If you sync now: 1 operation');
	expect(modal.contentEl.querySelector('.drive-bridge-file-tree.is-read-only')).not.toBeNull();
	void button('Done').click();
	expect((modal as unknown as ModalSpy).closed).toBe(true);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('with nothing to do, only the sentence', () => {
	const modal = new PreviewModal({} as never, {
		description: 'Everything is in sync',
		done: 'Done',
		tasks: [],
		title: 'Sync preview',
		translate,
	});
	modal.open();
	expect(modal.contentEl.querySelector('.drive-bridge-file-tree')).toBeNull();
	expect(modal.contentEl.textContent).toContain('Everything is in sync');
});
