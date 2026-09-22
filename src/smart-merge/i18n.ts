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
	conflictOursMarkersDescription:
		'Set the markers before and after the region in a merge conflict that shows local changes.',
	conflictTheirsMarkers: '"Theirs" conflict markers',
	conflictTheirsMarkersDescription:
		'Set the markers before and after the region in a merge conflict that shows remote changes.',
	deletionMarkers: 'Deletion conflict markers',
	deletionMarkersDescription:
		'Set the markers before and after the region that is deleted by one side, but modified by the other side.',
	end: 'End',
	smartMerge: 'Smart merge',
	start: 'Start',
};

export default en;
