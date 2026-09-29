import { expect, test } from 'bun:test';
import { labelSetupEntryLater } from '@/gdrive/setup-page';

const translate = ((key: string) => key) as never;

test('the Guide label is drawn on the Set up a Google client entry, once', async () => {
	const page = document.createElement('div');
	const entry = page.createDiv({ cls: 'setting-item' });
	const name = entry.createDiv({ cls: 'setting-item-name', text: 'setupPage' });
	const other = page.createDiv({ cls: 'setting-item-name', text: 'setUpFromDevice' });
	document.body.append(page);
	try {
		labelSetupEntryLater(page, translate);
		labelSetupEntryLater(page, translate);
		await Promise.resolve();
		const labels = [...name.querySelectorAll('.drive-bridge-label')].map(
			(label) => label.textContent,
		);
		expect(labels).toStrictEqual(['guide']);
		// English capitals whatever the interface language: GUIDE, not GUİDE.
		expect(name.querySelector('.drive-bridge-label')?.getAttribute('lang')).toBe('en');
		expect(other.querySelector('.drive-bridge-label')).toBeNull();
	} finally {
		page.remove();
	}
});
