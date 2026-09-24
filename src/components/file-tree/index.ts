import { setIcon, setTooltip } from 'obsidian';
import type { Snippet, Translate } from '@/modules/i18n';
import type { BaseTask, TaskNames } from '@/sync';
import reverseTask from '@/sync/reverse';
import constructTaskIcon from '../construct-task-icon';
import createFileTreeSelection from './selection';
import createFileTreeData from './tree-data';

export type FileTreeTranslations = {
	selectAll: string;
	xSelected: Snippet<number>;
	undoUpload: string;
	undoDownload: string;
	undoRemoveLocal: string;
	undoRemoveRemote: string;
};

type Row = {
	checkbox: HTMLInputElement;
	label: HTMLElement;
	icon: HTMLElement;
	task: BaseTask;
	undo?: HTMLElement;
};

const UNDO_TEXT: Partial<Record<TaskNames, keyof FileTreeTranslations>> = {
	download: 'undoDownload',
	removeLocal: 'undoRemoveLocal',
	removeRemote: 'undoRemoveRemote',
	upload: 'undoUpload',
};

const isDirTask = (task: BaseTask) => task.local?.isDir ?? task.remote?.isDir ?? false;

// Renders a checkbox tree of sync tasks. Selection rules live in ./selection; this file only
// keeps the DOM in step with them. With `undo`, rows that can be reversed get a button that
// runs the opposite task instead (see reverseTask).
export default function mount(
	el: HTMLElement,
	tasks: Array<BaseTask>,
	translate: Translate<FileTreeTranslations>,
	{ undo = false }: { undo?: boolean } = {},
) {
	const data = createFileTreeData(tasks);
	const selection = createFileTreeSelection(
		data,
		(task) => undo && reverseTask(task) !== undefined,
	);
	const root = el.createDiv({ cls: 'drive-bridge-file-tree' });
	const rows = new Map<string, Row>();
	let selectAll: { checkbox: HTMLInputElement; count: HTMLElement } | undefined;

	const refreshSelectAll = () => {
		if (!selectAll) return;
		const total = data.taskNodeIds.length;
		const count = data.taskNodeIds.filter((nodeId) => selection.isSelected(nodeId)).length;
		const reversed = data.taskNodeIds.filter((nodeId) => selection.isReversed(nodeId)).length;
		selectAll.checkbox.checked = count === total;
		selectAll.checkbox.indeterminate = count > 0 && count < total;
		selectAll.count.setText(translate('xSelected', count + reversed));
	};

	const refreshRow = (nodeId: string) => {
		const row = rows.get(nodeId);
		if (!row) return;
		const selected = selection.isSelected(nodeId);
		const reversed = selection.isReversed(nodeId);
		row.checkbox.checked = selected;
		row.label.toggleClass('is-deselected', !selected && !reversed);
		row.label.toggleClass('is-reversed', reversed);
		row.undo?.toggleClass('is-active', reversed);
		// The icon shows what will run: the planned task, or its opposite.
		const shown = (reversed && reverseTask(row.task)) || row.task;
		row.icon.empty();
		constructTaskIcon(row.icon, shown.name, isDirTask(shown));
		setTooltip(row.icon, shown.prettyName);
	};

	const refresh = (changed: Set<string>) => {
		for (const changedId of changed) refreshRow(changedId);
		refreshSelectAll();
	};
	const toggle = (nodeId: string, nextSelected: boolean) =>
		refresh(selection.toggle(nodeId, nextSelected));

	if (data.taskNodeIds.length > 1) {
		const header = root.createDiv({ cls: 'drive-bridge-file-tree-row' });
		const checkbox = header.createEl('input', { type: 'checkbox' });
		setIcon(header.createDiv({ cls: 'drive-bridge-file-tree-small-icon' }), 'folders');
		const label = header.createDiv({
			cls: 'drive-bridge-file-tree-label',
			text: translate('selectAll'),
		});
		selectAll = { checkbox, count: label.createSpan({ cls: 'drive-bridge-file-tree-count' }) };
		header.addEventListener('click', () => {
			const nothingSelected = !data.taskNodeIds.some((nodeId) =>
				selection.isSelected(nodeId),
			);
			for (const nodeId of data.taskNodeIds) toggle(nodeId, nothingSelected);
		});
	}

	for (const nodeId of data.orderedNodeIds) {
		const node = data.nodes[nodeId];
		if (!node) continue;
		const { task } = node;
		const row = root.createDiv({ cls: 'drive-bridge-file-tree-row' });
		row.style.paddingLeft = `${node.depth * 24}px`;

		let checkbox: HTMLInputElement | undefined;
		if (task) checkbox = row.createEl('input', { type: 'checkbox' });
		else row.createDiv({ cls: 'drive-bridge-file-tree-dot' });
		const icon = row.createDiv({ cls: 'drive-bridge-file-tree-icon' });
		const label = row.createDiv({
			cls: 'drive-bridge-file-tree-label',
			text: node.compressedLabel,
		});

		if (task && checkbox) {
			const entry: Row = { checkbox, icon, label, task };
			const undoText = UNDO_TEXT[task.name];
			if (selection.canReverse(nodeId) && undoText) {
				const button = row.createDiv({ cls: 'drive-bridge-file-tree-undo clickable-icon' });
				setIcon(button, 'undo-2');
				setTooltip(button, translate(undoText));
				button.setAttr('aria-label', translate(undoText));
				button.addEventListener('click', (event) => {
					event.stopPropagation();
					refresh(selection.reverse(nodeId, !selection.isReversed(nodeId)));
				});
				entry.undo = button;
			}
			rows.set(nodeId, entry);
			row.addEventListener('click', () => toggle(nodeId, !selection.isSelected(nodeId)));
			refreshRow(nodeId);
		} else setIcon(icon, 'folder-open');
	}
	refreshSelectAll();

	return {
		getState: selection.getState,
		unmount: () => root.remove(),
	};
}
