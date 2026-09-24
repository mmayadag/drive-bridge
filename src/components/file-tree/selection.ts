import type { BaseTask } from '@/sync';
import type { FileTreeData, FileTreeNode } from './types';

function isDeleteTask(node: FileTreeNode | undefined): boolean {
	return node?.task?.name === 'removeLocal' || node?.task?.name === 'removeRemote';
}

function usesCreationCascade(node: FileTreeNode | undefined): boolean {
	return node?.task !== undefined && !isDeleteTask(node);
}

type State = { selected: Set<string>; reversed: Set<string> };

// A task runs as planned (selected), runs reversed, or is skipped; never two at once.
function setSelected(state: State, nodeId: string, nextSelected: boolean, changed: Set<string>) {
	if (nextSelected && state.reversed.delete(nodeId)) changed.add(nodeId);
	const has = state.selected.has(nodeId);
	if (has === nextSelected) return;
	if (nextSelected) state.selected.add(nodeId);
	else state.selected.delete(nodeId);
	changed.add(nodeId);
}

function setReversed(state: State, nodeId: string, changed: Set<string>) {
	if (state.reversed.has(nodeId)) return;
	state.reversed.add(nodeId);
	state.selected.delete(nodeId);
	changed.add(nodeId);
}

export default function createFileTreeSelection(
	data: FileTreeData,
	canReverse: (task: BaseTask) => boolean = () => false,
): {
	isSelected: (nodeId: string) => boolean;
	isReversed: (nodeId: string) => boolean;
	canReverse: (nodeId: string) => boolean;
	toggle: (nodeId: string, nextSelected: boolean) => Set<string>;
	reverse: (nodeId: string, nextReversed: boolean) => Set<string>;
	getState: () => {
		selected: Array<BaseTask>;
		deselected: Array<BaseTask>;
		reversed: Array<BaseTask>;
	};
} {
	const state: State = { reversed: new Set(), selected: new Set(data.taskNodeIds) };
	const reversible = (nodeId: string) => {
		const task = data.nodes[nodeId]?.task;
		return task !== undefined && canReverse(task);
	};
	const toggle = (nodeId: string, nextSelected: boolean) => {
		const changed = new Set<string>();
		const node = data.nodes[nodeId];
		if (!node?.task) return changed;

		setSelected(state, nodeId, nextSelected, changed);

		if (node.isCreateFolderTask) {
			if (!nextSelected)
				for (const descendantId of node.selectableDescendantTaskIds)
					if (usesCreationCascade(data.nodes[descendantId]))
						setSelected(state, descendantId, false, changed);
		} else if (node.isDeleteFolderTask && nextSelected)
			for (const descendantId of node.selectableDescendantTaskIds)
				if (isDeleteTask(data.nodes[descendantId]))
					setSelected(state, descendantId, true, changed);

		if (nextSelected && usesCreationCascade(node))
			for (const ancestorId of node.ancestorCreateFolderTaskIds)
				setSelected(state, ancestorId, true, changed);
		// A deletion cannot run inside a folder that is kept.
		else if (!nextSelected && isDeleteTask(node))
			for (const ancestorId of node.ancestorDeleteFolderTaskIds)
				setSelected(state, ancestorId, false, changed);

		return changed;
	};

	return {
		canReverse: reversible,
		getState() {
			const selected: Array<BaseTask> = [];
			const deselected: Array<BaseTask> = [];
			const reversed: Array<BaseTask> = [];
			for (const taskNodeId of data.taskNodeIds) {
				const task = data.nodes[taskNodeId]?.task;
				if (!task) continue;
				if (state.selected.has(taskNodeId)) selected.push(task);
				else if (state.reversed.has(taskNodeId)) reversed.push(task);
				else deselected.push(task);
			}
			return { deselected, reversed, selected };
		},
		isReversed(nodeId: string) {
			return state.reversed.has(nodeId);
		},
		isSelected(nodeId: string) {
			return state.selected.has(nodeId);
		},
		// Undoing a deletion brings back the folders around it too, and a folder brings back
		// what was deleted inside it: a file cannot come back into a folder that is gone.
		reverse(nodeId: string, nextReversed: boolean) {
			const node = data.nodes[nodeId];
			if (!node || !reversible(nodeId)) return new Set<string>();
			if (!nextReversed) return toggle(nodeId, true);
			const changed = new Set<string>();
			const deleteIds = isDeleteTask(node)
				? [
						...node.ancestorDeleteFolderTaskIds,
						...(node.isDeleteFolderTask
							? node.selectableDescendantTaskIds.filter((id) =>
									isDeleteTask(data.nodes[id]),
								)
							: []),
					]
				: [];
			for (const id of [nodeId, ...deleteIds])
				if (reversible(id)) setReversed(state, id, changed);
			return changed;
		},
		toggle,
	};
}
