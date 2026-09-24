import { ProgressBarComponent } from 'obsidian';

export default function renderProgress(container: HTMLElement, extraClass?: string) {
	const progressSection = container.createDiv(`drive-bridge-progress ${extraClass ?? ''}`);
	const progressTextContainer = progressSection.createDiv('drive-bridge-progress-text');
	const left = progressTextContainer.createDiv('drive-bridge-progress-current');
	const right = progressTextContainer.createDiv('drive-bridge-progress-count');
	const barEl = progressSection.createDiv('drive-bridge-progress-bar');
	const bar = new ProgressBarComponent(barEl);
	return { bar, barEl, left, right };
}
