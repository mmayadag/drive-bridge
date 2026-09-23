export type SmartMergeTranslations = {
	conflictOursMarkers: string;
	conflictOursMarkersDescription: string;
	conflictTheirsMarkers: string;
	conflictTheirsMarkersDescription: string;
	deletionMarkers: string;
	deletionMarkersDescription: string;
	smartMerge: string;
	smartMergeDescription: string;
	mergeMarkers: string;
	start: string;
	end: string;
};

const en: SmartMergeTranslations = {
	conflictOursMarkers: '"Ours" conflict markers',
	conflictOursMarkersDescription: 'Markers around local changes in a merge conflict.',
	conflictTheirsMarkers: '"Theirs" conflict markers',
	conflictTheirsMarkersDescription: 'Markers around remote changes in a merge conflict.',
	deletionMarkers: 'Deletion conflict markers',
	deletionMarkersDescription: 'Markers around text deleted on one side and edited on the other.',
	end: 'End',
	mergeMarkers: 'Merge markers',
	smartMerge: 'Smart merge',
	smartMergeDescription:
		'Both edits are combined; overlapping lines are kept side by side and marked. Markdown only.',
	start: 'Start',
};

export default en;
