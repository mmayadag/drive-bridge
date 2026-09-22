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
	avoidAutoSyncWhenOffline: 'Avoid auto sync when offline',
	avoidAutoSyncWhenOfflineDescription:
		"Silently skip non-manual sync runs when there's no internet connection.",
	awaitingConfirmation: 'Awaiting confirmation',
	backend: 'Storage backend',
	backendDescription: 'Select the cloud service to use.',
	bidirectional: 'Bidirectional',
	buyMeACoffee: 'Buy me a coffee',
	buyMeACoffeeDescription: 'If the plugin saves you a headache, this is where to say thanks.',
	cancel: 'Cancel',
	cancelled: 'Cancelled',
	caseSensitive: 'Case sensitive',
	checkConnection: 'Check connection',
	checkConnectionFailed: 'Check connection failed',
	checkConnectionSuccess: 'Check connection succeeded',
	clear: 'Clear',
	clearRecords: 'Clear records',
	clearRecordsDescription:
		'Drive Bridge records sync states to resolve sync operations between local and remote files. This option allows you to clear records. Warning: this action is likely to cause changes in sync decisions.',
	completed: 'Completed',
	completedNoop: 'Already synced',
	confirm: 'Confirm',
	confirmDeleteDescription: (count) =>
		`Please confirm the ${count} local ${pItem(count)} that will be deleted; unselected items will be re-uploaded.`,
	confirmDeleteInAutoSync: 'Confirm deletions during auto-sync',
	confirmDeleteInAutoSyncDescription:
		'Show a confirmation of local files that will be deleted during auto-triggered syncs. You can choose to delete or re-upload them.',
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
	confirmTasksInSyncDescription:
		'Show pending operations and execute after confirmation (does not affect auto-sync).',
	conflictResolveStrategy: 'Conflict resolve strategy',
	conflictResolveStrategyDescription:
		'Select how to resolve the conflict when both remote and local have been modified since last sync.',
	controls: 'Controls',
	createLocalDir: 'Create local folder',
	createRemoteDir: 'Create remote folder',
	customHeaders: 'Custom headers',
	customHeadersDescription:
		'Extra HTTP headers added to every request this plugin makes to Google Drive, stored either in plaintext or in the OS keychain. Google Drive needs none of these.',
	development: 'Development',
	diffMatchPatch: 'Merge',
	done: 'Done',
	download: 'Download',
	edit: 'Edit',
	exclusionRules: 'Exclusion rules',
	exclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText(
				'Files / folders matching these Glob patterns will not be synced. Please remember to add file extensions (E.g. ',
			);
			frag.createEl('code', { text: '.md' });
			frag.appendText(') if you want to exclude files.');
		}),
	executing: 'Executing',
	export: 'Export',
	exportLogsDescription:
		'Export plugin logs to a file in the vault. Set the log export directory in the field.',
	exportLogsDirectoryPlaceholder: 'Set the directory to export logs to',
	exportLogsFailed: 'Failed to export logs',
	exportLogsToFile: 'Export logs to file',
	failed: 'Failed',
	failedTasksDescription: (count) => `${pcOperations(count)} failed during sync:`,
	features: 'Features',
	filterPlaceholder: 'E.g. temp.md, .trash/**/*',
	filterRules: 'Filter rules',
	headerKeyPlaceholder: 'Header key',
	headerValuePlaceholder: 'Header value',
	help: 'Help',
	helpDescription: 'Setup guide, every setting explained, and how to recover from mistakes.',
	hide: 'Hide',
	idle: 'Idle',
	inclusionRules: 'Inclusion rules',
	inclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText(
				'Files / folders matching exclusion rules but also matching these glob patterns will still be synced.',
			);
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
	maxFileSizeDescription:
		'Skip files exceeding this size during synchronization. This option is useful for services with storage space limitations. Alter the size limit in the field.',
	maxFileSizePlaceholder: 'Enter size limit (e.g. 10MB, 0.5GB)',
	maxMemoryConsumption: 'Max memory consumption',
	maxMemoryConsumptionDescription:
		'Limit the amount of memory used during synchronization. This option is useful for devices with memory limitations. Alter the memory limit in the field.',
	maxMemoryConsumptionPlaceholder: 'Enter memory limit (e.g. 1GB, 200MB)',
	maxRequestConcurrency: 'Max request concurrency',
	maxRequestConcurrencyDescription:
		'Limit the number of simultaneous requests during synchronization. This option is useful for services with request rate limits. Alter the concurrency limit in the field.',
	maxRequestConcurrencyPlaceholder: 'Enter concurrency limit',
	minRequestInterval: 'Min request interval',
	minRequestIntervalDescription:
		'Limit the minimum time between consecutive requests during synchronization. This option is useful for services with request rate limits. Alter the interval in the field.',
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
		'Display a notice on mobile devices when synchronization is in progress. Replaces the status bar on desktop.',
	open: 'Open',
	openGithub: 'Open GitHub',
	openPage: 'Open',
	realtimeSync: 'Realtime sync',
	realtimeSyncDescription:
		'Trigger syncs automatically as soon as files are modified. Alter the delay between a file being modified and the sync being triggered in the field.',
	realtimeSyncFastMode: 'Realtime sync fast mode',
	realtimeSyncFastModeDescription:
		'Reuse cached data and avoid unnecessary remote discovery during real-time sync to accelerate sync.',
	realtimeSyncPlaceholder: 'Enter sync delay (e.g. 500ms, 5s)',
	recordsCleared: 'Records cleared',
	removeLocal: 'Remove local',
	removeRecord: 'Remove record',
	removeRemote: 'Remove remote',
	renameAndKeepBoth: 'Rename and keep both',
	reportProblem: 'Report a problem',
	reportProblemDescription:
		'Opens a GitHub issue with the versions filled in. Nothing is sent until you write the report and submit it yourself.',
	reservedHeader:
		'That header is set by the plugin itself; overriding it would break every request.',
	resolveConflict: 'Resolve conflict',
	scheduledSync: 'Scheduled sync',
	scheduledSyncDescription:
		'Periodically trigger synchronizations over specified intervals. Alter the interval in the field.',
	scheduledSyncPlaceholder: 'Enter interval (e.g. 10min, 0.5h)',
	selectAll: 'Select all',
	settingTips: ({ labels, addLabel }) =>
		createFragment((frag) => {
			const line = frag.createDiv('drive-bridge-label-legend');
			for (const label of labels) {
				const item = line.createSpan();
				addLabel(item, label);
				item.appendText(` ${label.tooltip}`);
			}
		}),
	showProgress: 'Show progress',
	skip: 'Skip',
	speed: 'Speed',
	speedLabelDescription: 'Properly configuring this setting could improve sync speed.',
	startNonInteractiveSync: 'Start non-interactive sync',
	startSync: 'Start sync',
	startupSync: 'Startup sync',
	startupSyncDescription:
		'Automatically trigger a sync at plugin startup after specified delay. Alter the delay in the field.',
	startupSyncPlaceholder: 'Enter delay (e.g. 5s, 1min)',
	stopSync: 'Stop sync',
	support: 'Support',
	syncOnLeave: 'Sync when leaving Obsidian',
	syncOnLeaveDescription:
		'Sync as soon as Obsidian goes to the background or loses focus, if files changed since the last sync.',
	syncProgress: 'Sync progress',
	syncStrategy: 'Sync strategy',
	syncStrategyDescription: 'Select the synchronization strategy to resolve file changes.',
	upload: 'Upload',
	walkingRemote: 'Discovering remote files',
	webhookOnFinish: 'After a sync',
	webhookOnFinishDescription:
		'POST the result of a sync to this URL, with the number of completed and failed operations. Leave empty to send nothing.',
	webhookOnStart: 'Before a sync',
	webhookOnStartDescription:
		'POST a small JSON body to this URL when a sync starts. Leave empty to send nothing.',
	webhookOnlyWhenChanged: 'Only when files change',
	webhookOnlyWhenChangedDescription:
		'Skip both webhooks when a sync finds nothing to do. With this off, every scheduled sync sends a request.',
	webhookPlaceholder: 'https://example.com/hook',
	webhooks: 'Webhooks',
	xConfigured: (count) => `${count} configured`,
	xSelected: (count) => `(${count} selected)`,
};

export default en;
