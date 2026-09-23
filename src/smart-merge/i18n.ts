export type SmartMergeTranslations = {
	conflictOursMarkers: string;
	conflictOursMarkersDescription: string;
	conflictTheirsMarkers: string;
	conflictTheirsMarkersDescription: string;
	deletionMarkers: string;
	deletionMarkersDescription: string;
	smartMerge: string;
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
	smartMerge: 'Smart merge',
	start: 'Start',
};

export default en;
