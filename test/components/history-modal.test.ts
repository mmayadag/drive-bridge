import {
	ModalSpy,
	NoticeSpy,
	SettingSpy,
	button,
	notices,
	resetSpies,
	settings,
} from '$/support/modal-spies';
import ObsidianMock from '$/support/obsidian-mock';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { SyncSummary } from '@/sync/history';
import { emptyCounts } from '@/sync/history';

// HistoryModal styles the name of a failed row, so rows need a real name and description.
class RowSpy extends SettingSpy {
	nameEl = this.settingEl.createDiv();
	descEl = this.settingEl.createDiv();
	setName(name: string) {
		this.nameEl.setText(name);
		return super.setName(name);
	}
	setDesc(desc?: string) {
		this.descEl.setText(desc ?? '');
		return this;
	}
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Modal: ModalSpy,
	Notice: NoticeSpy,
	Setting: RowSpy,
}));
const { HistoryModal, LogModal } = await import('@/components/history-modal');

beforeEach(resetSpies);

const texts = {
	describe: ({ result, trigger }: SyncSummary) => ({
		detail: `by ${trigger}`,
		heading: `Sync ${result}`,
	}),
	empty: 'No syncs yet',
	showLog: 'Show log',
	title: 'Sync history',
};

const summary = (result: SyncSummary['result'], trigger: string): SyncSummary => ({
	at: 1,
	counts: emptyCounts(),
	result,
	trigger,
});

test('lists each sync, newest first, and marks failed ones', () => {
	const modal = new HistoryModal({} as never, {
		history: [summary('failed', 'manual'), summary('completed', 'interval')],
		showLog: () => {},
		texts,
	});
	modal.open();
	expect((modal as unknown as ModalSpy).title).toBe('Sync history');
	expect(modal.contentEl.textContent).not.toContain('No syncs yet');
	const rows = settings.filter((row) => row.name) as Array<RowSpy>;
	expect(rows.map((row) => row.name)).toStrictEqual(['Sync failed', 'Sync completed']);
	expect(rows.map((row) => row.descEl.textContent)).toStrictEqual(['by manual', 'by interval']);
	expect(
		rows.map((row) => row.nameEl.classList.contains('drive-bridge-warning-text')),
	).toStrictEqual([true, false]);
});

test('with no history it says so, and show log closes it and opens the log', async () => {
	const shown: Array<true> = [];
	const modal = new HistoryModal({} as never, {
		history: [],
		showLog: () => shown.push(true),
		texts,
	});
	modal.open();
	expect(modal.contentEl.querySelector('p')?.textContent).toBe('No syncs yet');
	await button('Show log').click();
	expect(shown).toStrictEqual([true]);
	expect((modal as unknown as ModalSpy).closed).toBe(true);
	expect(modal.contentEl.childElementCount).toBe(0);
});

test('the log shows read-only, to select; nothing touches the clipboard', () => {
	const modal = new LogModal({} as never, {
		log: 'line 1\nline 2',
		selectAll: 'Select all',
		title: 'Log',
	});
	modal.open();
	expect((modal as unknown as ModalSpy).title).toBe('Log');
	const area = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
	expect(area.value).toBe('line 1\nline 2');
	expect(area.hasAttribute('readonly')).toBe(true);
	void button('Select all').click();
	expect([area.selectionStart, area.selectionEnd]).toStrictEqual([0, area.value.length]);
	expect(notices).toStrictEqual([]);
	modal.close();
	expect(modal.contentEl.childElementCount).toBe(0);
});
