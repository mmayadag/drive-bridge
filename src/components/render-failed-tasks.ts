import { setTooltip } from 'obsidian';
import type { FailedTaskInfo } from '@/modules/sync';
import constructTaskIcon from './construct-task-icon';

function renderFailedTaskRow(
	itemEl: HTMLDivElement,
	{ name, key, error, prettyName, isDir }: FailedTaskInfo,
) {
	const row = itemEl.createDiv();
	const main = row.createDiv('drive-bridge-failed-task');
	const icon = main.createSpan('drive-bridge-failed-task-icon');
	constructTaskIcon(icon, name, isDir);
	setTooltip(icon, prettyName);

	main.createSpan({ cls: 'drive-bridge-failed-task-type', text: prettyName });
	main.createSpan({ cls: 'drive-bridge-failed-task-path', text: key });
	row.createDiv({ cls: 'drive-bridge-failed-task-error', text: error });
}

export default function renderFailedTasks(
	detailContainer: HTMLDivElement,
	failedTasks: Array<FailedTaskInfo>,
): void {
	detailContainer.empty();
	const tasksContainer = detailContainer.createDiv('drive-bridge-failed-tasks');
	detailContainer.show();
	failedTasks.forEach((task) => renderFailedTaskRow(tasksContainer, task));
}
