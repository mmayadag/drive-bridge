import { ProgressBarComponent } from 'obsidian';

export default function renderProgress(container: HTMLElement, extraClass?: string) {
	const progressSection = container.createDiv(`flex flex-col gap-2 ${extraClass ?? ''}`);
	const progressTextContainer = progressSection.createDiv(
		'flex flex-row text-3 text-[--text-muted] whitespace-nowrap',
	);
	const left = progressTextContainer.createDiv('truncate mr-auto');
	const right = progressTextContainer.createDiv('ml-2');
	const bar = new ProgressBarComponent(progressSection);
	return { bar, left, right };
}
