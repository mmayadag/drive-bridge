import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const tooltips: Array<string> = [];
void mock.module('obsidian', () => ({
	...ObsidianMock,
	setTooltip: (_el: unknown, text: string) => void tooltips.push(text),
}));
const { mountStatusBar, openPluginSettings } = await import('@/components/status-bar');
const { ref } = await import('@/shared/reactive');

test('opens the plugin tab when Obsidian offers it, and says so when it does not', () => {
	const calls: Array<string> = [];
	const app = {
		setting: { open: () => calls.push('open'), openTabById: (id: string) => calls.push(id) },
	};
	expect(openPluginSettings(app as never, 'drive-bridge')).toBe(true);
	expect(calls).toStrictEqual(['open', 'drive-bridge']);
	expect(openPluginSettings({} as never, 'drive-bridge')).toBe(false);
	const broken = {
		setting: {
			open: () => {},
			openTabById: () => {
				throw new Error('gone');
			},
		},
	};
	expect(openPluginSettings(broken as never, 'drive-bridge')).toBe(false);
});

test('the status item shows the text, spins while busy, hides its text on request, and clicks', () => {
	tooltips.length = 0;
	const el = document.createElement('div');
	const text = ref('');
	const idle = ref(true);
	let clicks = 0;
	const bar = mountStatusBar(el, {
		idle,
		idleText: 'Idle',
		onClick: () => clicks++,
		showText: true,
		text,
	});
	const label = el.querySelector('.drive-bridge-status-text') as HTMLElement;
	expect(label.textContent).toBe('Idle');
	expect(tooltips.at(-1)).toBe('Drive Bridge · Idle');
	text('Already synced');
	expect(label.textContent).toBe('Already synced');
	expect(tooltips.at(-1)).toBe('Drive Bridge · Already synced');
	idle(false);
	expect(el.firstElementChild?.classList.contains('drive-bridge-spin')).toBe(true);
	bar.showText(false);
	expect(label.style.display).toBe('none');
	bar.showText(true);
	expect(label.style.display).not.toBe('none');
	el.click();
	expect(clicks).toBe(1);
	bar.cleanup();
	el.click();
	expect(clicks).toBe(1);
});

test('the text can start hidden', () => {
	const el = document.createElement('div');
	mountStatusBar(el, {
		idle: ref(true),
		idleText: 'Idle',
		onClick: () => {},
		showText: false,
		text: ref(''),
	});
	expect((el.querySelector('.drive-bridge-status-text') as HTMLElement).style.display).toBe(
		'none',
	);
});
