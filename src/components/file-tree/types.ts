import type { BaseTask } from '@/sync';

export type FileTreeNode = {
	id: string;
	path: string;
	depth: number;
	childIds: Array<string>;
	task?: BaseTask;
	compressedLabel: string;
	isFolderTask: boolean;
	isCreateFolderTask: boolean;
	isDeleteFolderTask: boolean;
	selectableDescendantTaskIds: Array<string>;
	ancestorCreateFolderTaskIds: Array<string>;
	ancestorDeleteFolderTaskIds: Array<string>;
};

export type FileTreeData = {
	orderedNodeIds: Array<string>;
	nodes: Record<string, FileTreeNode>;
	taskNodeIds: Array<string>;
};
