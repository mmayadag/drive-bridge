import type { Translations } from '@';

const p = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);
const pc = (count: number, singular: string, plural: string) =>
	`${count} ${p(count, singular, plural)}`;

const pItem = (count: number) => p(count, 'item', 'items');
const pcOperations = (count: number) => pc(count, 'operation', 'operations');

const en: Translations = {
	addExclusionRule: 'Add exclusion rule',
	addHeader: 'Add header',
	addInclusionRule: 'Add inclusion rule',
	addRecord: 'Add record',
	addSecretHeader: 'Add secret header',
	advanced: 'Advanced',
	automaticSync: 'Automatic sync',
	avoidAutoSyncWhenOffline: 'Avoid auto sync when offline',
	avoidAutoSyncWhenOfflineDescription: 'Skip automatic syncs when there is no internet.',
	awaitingConfirmation: 'Awaiting confirmation',
	backend: 'Storage backend',
	backendDescription: 'Where this vault syncs to.',
	bidirectional: 'Bidirectional',
	buyMeACoffee: 'Buy me a coffee',
	cancel: 'Cancel',
	cancelled: 'Cancelled',
	caseSensitive: 'Case sensitive',
	checkConnection: 'Check connection',
	checkConnectionFailed: 'Check connection failed',
	checkConnectionSuccess: 'Check connection succeeded',
	clear: 'Clear',
	clearRecords: 'Clear records',
	clearRecordsConfirm:
		'Drive Bridge forgets what it knew about the last sync. The next sync compares everything again and may upload, download or flag conflicts it would otherwise skip. Your files are not changed now.',
	clearRecordsDescription: 'Forget the stored sync state. The next sync may decide differently.',
	coffeeQuestion: 'Did Drive Bridge save you a headache?',
	completed: 'Completed',
	completedNoop: 'Already synced',
	confirm: 'Confirm',
	confirmDeleteDescription: (count) =>
		`Please confirm the ${count} local ${pItem(count)} that will be deleted; unselected items will be re-uploaded.`,
	confirmDeleteInAutoSync: 'Confirm deletions during auto-sync',
	confirmDeleteInAutoSyncDescription:
		'Review local deletions in automatic syncs: delete or re-upload them.',
	confirmTasksDescription: ({ total, conflict, deleteLocal, deleteRemote }) => {
		const deleteOr = deleteLocal + deleteRemote !== 0;
		let result = `Sync will execute ${pcOperations(total)} in total`;
		if (deleteOr || conflict !== 0) result += '. Including';
		if (deleteOr) result += ' deleting';
		if (deleteLocal !== 0) result += ` ${deleteLocal} local ${pItem(deleteLocal)}`;
		if (deleteLocal !== 0 && deleteRemote !== 0) result += ' plus';
		if (deleteRemote !== 0) result += ` ${deleteRemote} remote ${pItem(deleteRemote)}`;
		if (deleteOr && conflict !== 0) result += ', and';
		if (conflict !== 0) result += ` resolving ${pc(conflict, 'conflict', 'conflicts')}`;
		result += ':';
		return result;
	},
	confirmTasksInSync: 'Confirm operations in manual sync',
	confirmTasksInSyncDescription: 'Review pending operations before a manual sync runs.',
	conflictResolveStrategy: 'Conflict resolve strategy',
	conflictResolveStrategyDescription: 'What to do when a file changed on both sides.',
	controls: 'Controls',
	createLocalDir: 'Create local folder',
	createRemoteDir: 'Create remote folder',
	customHeaders: 'Custom headers',
	customHeadersDescription:
		'Extra HTTP headers on every Drive request, in plain text or the OS keychain. Drive needs none.',
	development: 'Development',
	diffMatchPatch: 'Merge',
	done: 'Done',
	download: 'Download',
	edit: 'Edit',
	exclusionRules: 'Exclusion rules',
	exclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText('Glob patterns to skip. Include the extension for files, e.g. ');
			frag.createEl('code', { text: '.md' });
			frag.appendText('.');
		}),
	executing: 'Executing',
	export: 'Export',
	exportLogsDescription: 'Save plugin logs to the vault folder in the field.',
	exportLogsDirectoryPlaceholder: 'Set the directory to export logs to',
	exportLogsFailed: 'Failed to export logs',
	exportLogsToFile: 'Export logs to file',
	failed: 'Failed',
	failedTasksDescription: (count) => `${pcOperations(count)} failed during sync:`,
	filterPlaceholder: 'E.g. temp.md, .trash/**/*',
	filterRules: 'Filter rules',
	headerKeyPlaceholder: 'Header key',
	headerValuePlaceholder: 'Header value',
	help: 'Setup guide and every setting explained',
	helpAndSupport: 'Help and support',
	helpAndSupportDescription: 'Setup guide, bug reports and feature requests.',
	hide: 'Hide',
	idle: 'Idle',
	inclusionRules: 'Inclusion rules',
	inclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText('Glob patterns that sync even when an exclusion rule matches.');
		}),
	keepLocal: 'Keep local',
	keepRemote: 'Keep remote',
	lastSync: 'Last sync',
	lastSyncNever: 'No sync on this device yet.',
	lastSyncValue: ({ time, result }) => `${time} · ${result}`,
	latestSurvive: 'Latest survives',
	match: 'Match',
	matchLabelDescription: 'This setting must be kept the same on all devices.',
	maxFileSize: 'Max file size',
	maxFileSizeDescription: 'Skip files larger than this.',
	maxFileSizePlaceholder: 'Enter size limit (e.g. 10MB, 0.5GB)',
	maxMemoryConsumption: 'Max memory consumption',
	maxMemoryConsumptionDescription: 'Memory limit during sync, for devices with little memory.',
	maxMemoryConsumptionPlaceholder: 'Enter memory limit (e.g. 1GB, 200MB)',
	maxRequestConcurrency: 'Max request concurrency',
	maxRequestConcurrencyDescription: 'Most requests at once. Lower it if Drive rate-limits you.',
	maxRequestConcurrencyPlaceholder: 'Enter concurrency limit',
	minRequestInterval: 'Min request interval',
	minRequestIntervalDescription:
		'Least time between requests. Raise it if Drive rate-limits you.',
	minRequestIntervalPlaceholder: 'Enter interval (e.g. 1s, 500ms)',
	mirrorLocal: 'Mirror local',
	mirrorRemote: 'Mirror remote',
	miscellaneous: 'Miscellaneous',
	moveLocal: 'Move local',
	moveRemote: 'Move remote',
	noHeaderConfigured: 'No header configured.',
	noRuleConfigured: 'No rule configured.',
	none: 'None',
	noticeStatusOnMobile: 'Notice sync status on mobile',
	noticeStatusOnMobileDescription:
		'Show sync progress as a notice on mobile, where there is no status bar.',
	open: 'Open',
	pluginVersion: (version) => `Drive Bridge ${version}`,
	realtimeSync: 'Realtime sync',
	realtimeSyncDescription: 'Sync after a file changes, once the delay in the field passes.',
	realtimeSyncFastMode: 'Realtime sync fast mode',
	realtimeSyncFastModeDescription:
		'Use cached data instead of a full Drive scan on realtime syncs.',
	realtimeSyncPlaceholder: 'Enter sync delay (e.g. 500ms, 5s)',
	recordsCleared: 'Records cleared',
	removeLocal: 'Remove local',
	removeRecord: 'Remove record',
	removeRemote: 'Remove remote',
	renameAndKeepBoth: 'Rename and keep both',
	reportBug: 'Report a bug. Nothing is sent until you submit it on GitHub.',
	requestFeature: 'Request a feature. Nothing is sent until you submit it on GitHub.',
	reservedHeader:
		'That header is set by the plugin itself; overriding it would break every request.',
	resolveConflict: 'Resolve conflict',
	scheduledSync: 'Scheduled sync',
	scheduledSyncDescription: 'Sync at the interval in the field.',
	scheduledSyncPlaceholder: 'Enter interval (e.g. 10min, 0.5h)',
	selectAll: 'Select all',
	showProgress: 'Show progress',
	skip: 'Skip',
	speed: 'Speed',
	speedLabelDescription: 'Properly configuring this setting could improve sync speed.',
	startNonInteractiveSync: 'Start non-interactive sync',
	startSync: 'Start sync',
	startupSync: 'Startup sync',
	startupSyncDescription: 'Sync when Obsidian opens, after the delay in the field.',
	startupSyncPlaceholder: 'Enter delay (e.g. 5s, 1min)',
	stopSync: 'Stop sync',
	syncOnLeave: 'Sync when leaving Obsidian',
	syncOnLeaveDescription: 'Sync when Obsidian goes to the background, if files changed.',
	syncProgress: 'Sync progress',
	syncStrategy: 'Sync strategy',
	syncStrategyDescription: 'How changes flow between this vault and Drive.',
	upload: 'Upload',
	walkingRemote: 'Discovering remote files',
	webhookOnFinish: 'After a sync',
	webhookOnFinishDescription: 'POST the result here when a sync ends. Empty sends nothing.',
	webhookOnStart: 'Before a sync',
	webhookOnStartDescription:
		'POST a small JSON body here when a sync starts. Empty sends nothing.',
	webhookOnlyWhenChanged: 'Only when files change',
	webhookOnlyWhenChangedDescription: 'Skip both webhooks when there was nothing to sync.',
	webhookPlaceholder: 'https://example.com/hook',
	webhooks: 'Webhooks',
	xConfigured: (count) => `${count} configured`,
	xOfYOn: ({ on, total }) => `${on} of ${total} on`,
	xSelected: (count) => `(${count} selected)`,
};

export default en;
