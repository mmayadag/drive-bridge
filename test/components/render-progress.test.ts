import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const bars: Array<HTMLElement> = [];
class ProgressBarSpy {
	constructor(readonly containerEl: HTMLElement) {
		bars.push(containerEl);
	}
}
void mock.module('obsidian', () => ({ ...ObsidianMock, ProgressBarComponent: ProgressBarSpy }));
const { default: renderProgress } = await import('@/components/render-progress');

test('lays out the current item and the count above a bar', () => {
	const container = document.createElement('div');
	const { bar, barEl, left, right } = renderProgress(container, 'is-compact');
	const section = container.firstElementChild as HTMLElement;
	expect([...section.classList]).toStrictEqual(['drive-bridge-progress', 'is-compact']);
	const text = section.querySelector('.drive-bridge-progress-text');
	expect(text?.firstElementChild).toBe(left);
	expect(text?.lastElementChild).toBe(right);
	expect(left.className).toBe('drive-bridge-progress-current');
	expect(right.className).toBe('drive-bridge-progress-count');
	expect(section.lastElementChild).toBe(barEl);
	expect(barEl.className).toBe('drive-bridge-progress-bar');
	expect((bar as unknown as ProgressBarSpy).containerEl).toBe(barEl);
});

test('without an extra class, only the base class is set', () => {
	const container = document.createElement('div');
	const { barEl } = renderProgress(container);
	expect([...(container.firstElementChild as HTMLElement).classList]).toStrictEqual([
		'drive-bridge-progress',
	]);
	expect(bars.at(-1)).toBe(barEl);
});
