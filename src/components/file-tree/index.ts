import { setIcon, setTooltip } from 'obsidian';
import type { Snippet, Translate } from '@/modules/i18n';
import type { BaseTask } from '@/sync';
import constructTaskIcon from '../construct-task-icon';
import createFileTreeSelection from './selection';
import createFileTreeData from './tree-data';

export type FileTreeTranslations = { selectAll: string; xSelected: Snippet<number> };

type Row = { checkbox: HTMLInputElement; label: HTMLElement };

// Renders a checkbox tree of sync tasks. Selection rules live in ./selection; this file only
// keeps the DOM in step with them.
export default function mount(
	el: HTMLElement,
	tasks: Array<BaseTask>,
	translate: Translate<FileTreeTranslations>,
) {
	const data = createFileTreeData(tasks);
	const selection = createFileTreeSelection(data);
	const root = el.createDiv({ cls: 'drive-bridge-file-tree' });
	const rows = new Map<string, Row>();
	let selectAll: { checkbox: HTMLInputElement; count: HTMLElement } | undefined;

	const refreshSelectAll = () => {
		if (!selectAll) return;
		const total = data.taskNodeIds.length;
		const count = data.taskNodeIds.filter((nodeId) => selection.isSelected(nodeId)).length;
		selectAll.checkbox.checked = count === total;
		selectAll.checkbox.indeterminate = count > 0 && count < total;
		selectAll.count.setText(translate('xSelected', count));
	};

	const refreshRow = (nodeId: string) => {
		const row = rows.get(nodeId);
		if (!row) return;
		const selected = selection.isSelected(nodeId);
		row.checkbox.checked = selected;
		row.label.toggleClass('is-deselected', !selected);
	};

	const toggle = (nodeId: string, nextSelected: boolean) => {
		for (const changedId of selection.toggle(nodeId, nextSelected)) refreshRow(changedId);
		refreshSelectAll();
	};

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
			const isDir = task.local?.isDir ?? task.remote?.isDir ?? false;
			constructTaskIcon(icon, task.name, isDir);
			setTooltip(icon, task.prettyName);
			rows.set(nodeId, { checkbox, label });
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
