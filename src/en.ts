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
	asymmetricStorage: 'Asymmetric storage',
	asymmetricStorageDescription: () =>
		createFragment((frag) => {
			frag.appendText('Use asymmetric storage to substantially accelerate syncing.');
		}),
	asymmetricStorageMigration: (enable) =>
		createFragment((frag) => {
			if (enable) {
				frag.createEl('p', {
					text: 'You should be cautious about following points before enabling asymmetric storage:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'Remote storage will no longer mirror local hierarchical structure. All files will be uploaded flatly to the base directory with random string anchors prepended.',
				});
				ol.createEl('li', {
					text: "If you need the remote to remain readable by humans, please don't enable this feature.",
				});
				ol.createEl('li', {
					text: 'After enabling, please ensure all devices have asymmetric storage enabled.',
				});
				ol.createEl('li', {
					text: 'Migration is necessary if this vault was previously uploaded without asymmetric storage.',
				});
			} else {
				frag.createEl('p', {
					text: 'You should be cautious about following points before disabling asymmetric storage:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'All subsequent uploads will mirror local hierarchical structure.',
				});
				ol.createEl('li', {
					text: 'Please ensure all devices have asymmetric storage disabled.',
				});
				ol.createEl('li', {
					text: 'Migration is necessary if this vault was previously uploaded with asymmetric storage enabled.',
				});
			}
		}),
	avoidAutoSyncWhenOffline: 'Avoid auto sync when offline',
	avoidAutoSyncWhenOfflineDescription:
		"Silently skip non-manual sync runs when there's no internet connection.",
	awaitingConfirmation: 'Awaiting confirmation',
	backend: 'Storage backend',
	backendDescription: 'Select the cloud service to use.',
	bidirectional: 'Bidirectional',
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
		'Add custom headers to be included with each request, they can either be stored in plaintext or in Obsidian keychain.',
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
	migrationDescription:
		'Migration may take seconds to minutes depending on the vault size. If you have migrated the remote on other devices, you can skip the migration.\n\nStart migration now?',
	migrationFailed: 'Migration failed',
	migrationPhase1Description: 'Ensure local state is up-to-date',
	migrationPhase2Description: 'Clean up remote and records',
	migrationPhase3Description: 'Populate remote with new structure',
	migrationProcess: 'Migration process',
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
	realtimeSync: 'Realtime sync',
	realtimeSyncDescription:
		'Trigger syncs automatically as soon as files are modified. Alter the delay between a file being modified and the sync being triggered in the field.',
	realtimeSyncFastMode: 'Realtime sync fast mode',
	realtimeSyncFastModeDescription:
		'Reuse cached data and avoid unnecessary remote discovery during real-time sync to accelerate sync.',
	realtimeSyncPlaceholder: 'Enter sync delay (e.g. 500ms, 5s)',
	recordsCleared: 'Records cleared',
	remoteMigration: 'Remote migration',
	removeLocal: 'Remove local',
	removeRecord: 'Remove record',
	removeRemote: 'Remove remote',
	renameAndKeepBoth: 'Rename and keep both',
	resolveConflict: 'Resolve conflict',
	scheduledSync: 'Scheduled sync',
	scheduledSyncDescription:
		'Periodically trigger synchronizations over specified intervals. Alter the interval in the field.',
	scheduledSyncPlaceholder: 'Enter interval (e.g. 10min, 0.5h)',
	selectAll: 'Select all',
	settingTips: ({ labels, addLabel }) =>
		createFragment((frag) => {
			frag.createEl('p', { text: 'Labels on settings:' });
			const ul = frag.createEl('ul', 'drive-bridge-label-list');
			for (const label of labels) {
				const li = ul.createEl('li');
				const flair = addLabel(li, label);
				li.appendText(` ${flair.ariaLabel}`);
			}
		}),
	showProgress: 'Show progress',
	skip: 'Skip',
	speed: 'Speed',
	speedLabelDescription: 'Properly configuring this setting could improve sync speed.',
	startMigration: 'Start migration',
	startNonInteractiveSync: 'Start non-interactive sync',
	startSync: 'Start sync',
	startupSync: 'Startup sync',
	startupSyncDescription:
		'Automatically trigger a sync at plugin startup after specified delay. Alter the delay in the field.',
	startupSyncPlaceholder: 'Enter delay (e.g. 5s, 1min)',
	stopSync: 'Stop sync',
	syncProgress: 'Sync progress',
	syncStrategy: 'Sync strategy',
	syncStrategyDescription: 'Select the synchronization strategy to resolve file changes.',
	toggleWithoutMigration: 'Toggle without migration',
	upload: 'Upload',
	walkingRemote: 'Discovering remote files',
	xConfigured: (count) => `${count} configured`,
	xSelected: (count) => `(${count} selected)`,
};

export default en;
