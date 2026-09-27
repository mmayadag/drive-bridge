import { ModalSpy, NoticeSpy, SettingSpy, button, resetSpies } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import { beforeEach, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: SettingSpy,
}));
const { TextModal } = await import('@/components/selectable-text');

beforeEach(resetSpies);

test('a text window shows the text read-only, selects all of it, and empties on close', () => {
	const modal = new TextModal({} as never, {
		hint: 'Check it first',
		selectAll: 'Select all',
		text: 'report body',
		title: 'Report',
	});
	modal.open();
	expect((modal as unknown as ModalSpy).title).toBe('Report');
	expect(modal.contentEl.querySelector('p')?.textContent).toBe('Check it first');
	const area = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
	expect(area.readOnly).toBe(true);
	void button('Select all').click();
	expect([area.selectionStart, area.selectionEnd]).toStrictEqual([0, 'report body'.length]);
	modal.close();
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('without a hint, only the text and the button', () => {
	const modal = new TextModal({} as never, { selectAll: 'Select all', text: 'x', title: 'T' });
	modal.open();
	expect(modal.contentEl.querySelector('p')).toBeNull();
});
