import { ModalSpy, NoticeSpy, SettingSpy, button, resetSpies } from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import { beforeEach, expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: SettingSpy,
}));
const { default: ConfirmModal } = await import('@/components/confirm-modal');

beforeEach(resetSpies);

function open(onCancel?: () => void) {
	const calls: Array<string> = [];
	const modal = new ConfirmModal({} as never, {
		cancel: 'Cancel',
		confirm: 'Delete',
		message: 'Sure?',
		onCancel,
		onConfirm: () => calls.push('confirm'),
		title: 'Clear records',
	});
	modal.open();
	return { calls, modal };
}

test('shows the title and message, and confirming runs the action once', async () => {
	const cancelled: Array<true> = [];
	const { calls, modal } = open(() => cancelled.push(true));
	expect((modal as unknown as ModalSpy).title).toBe('Clear records');
	expect(modal.contentEl.textContent).toContain('Sure?');
	await button('Delete').click();
	expect(calls).toStrictEqual(['confirm']);
	expect(cancelled).toStrictEqual([]);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('cancelling, or closing another way, runs onCancel instead', async () => {
	const cancelled: Array<true> = [];
	const { calls, modal } = open(() => cancelled.push(true));
	await button('Cancel').click();
	expect(cancelled).toStrictEqual([true]);
	expect(calls).toStrictEqual([]);
	// Without onCancel, closing is just closing.
	resetSpies();
	open().modal.close();
	expect((modal as unknown as ModalSpy).closed).toBe(true);
});
