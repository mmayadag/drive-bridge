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
	automaticSyncPausedStatus: 'Auto sync paused',
	avoidAutoSyncWhenOffline: 'Avoid auto sync when offline',
	avoidAutoSyncWhenOfflineDescription: 'Skip automatic syncs when there is no internet.',
	awaitingConfirmation: 'Awaiting confirmation',
	backend: 'Storage backend',
	backendDescription: 'Where this vault syncs to.',
	bidirectional: 'Bidirectional',
	bidirectionalDescription: 'Changes on either side are copied to the other. Use this normally.',
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
	coffeeFailed: 'Not working yet? Report it above.',
	coffeeQuestion: 'Did Drive Bridge save you a headache?',
	coffeeSetUp: "Set it up, then let's talk coffee.",
	coffeeWorks: 'It works! Coffee time?',
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
	continueSync: 'Continue',
	controls: 'Controls',
	copyExport: 'Copy',
	copyProblemReport: 'Copy a problem report (versions, settings without secrets, recent log)',
	createLocalDir: 'Create local folder',
	createRemoteDir: 'Create remote folder',
	customHeaders: 'Custom headers',
	customHeadersDescription:
		'Extra HTTP headers on every Drive request, in plain text or the OS keychain. Drive needs none.',
	deleteThem: 'Delete them',
	development: 'Development',
	diffMatchPatch: 'Merge',
	done: 'Done',
	download: 'Download',
	edit: 'Edit',
	errorForbidden: 'Google Drive refused the request, often because of a rate or storage limit.',
	errorOffline: "Can't reach Google. Check the internet connection.",
	errorRateLimited: 'Too many requests. Sync will work again shortly.',
	errorServer: 'Google Drive had a problem. Try again later.',
	errorSignIn: 'Google no longer accepts the sign-in. Connect the account again.',
	errorTasksFailed: (count) => `${count} ${p(count, 'file', 'files')} could not be synced.`,
	excludeFromSync: 'Exclude from sync',
	excludedFromSync: 'Excluded from sync:',
	exclusionRules: 'Exclusion rules',
	exclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText('Glob patterns to skip. Include the extension for files, e.g. ');
			frag.createEl('code', { text: '.md' });
			frag.appendText('.');
		}),
	executing: 'Executing',
	export: 'Export',
	exportCopied: 'Settings copied. Paste them into Import settings on the other device.',
	exportLogsDescription: 'Save plugin logs to the vault folder in the field.',
	exportLogsDirectoryPlaceholder: 'Set the directory to export logs to',
	exportLogsFailed: 'Failed to export logs',
	exportLogsToFile: 'Export logs to file',
	exportSaved: (path) =>
		`Settings saved to "${path}". It syncs like any note; the Google account part stays encrypted.`,
	exportSettings: 'Export settings',
	exportSettingsDescription:
		'Copy every setting, and optionally the Google account sealed with a passphrase, to set up another device or keep a backup. Webhook URLs and plain-text headers are included as they are.',
	failed: 'Failed',
	failedTasksDescription: (count) => `${pcOperations(count)} failed during sync:`,
	fileSkipped: (key) =>
		`Drive Bridge: "${key}" failed three syncs in a row and is skipped now. Advanced → Development → Skipped files retries it.`,
	fileSynced: 'Synced',
	filesSkipped: (count) => `${pc(count, 'file', 'files')} skipped`,
	filterPlaceholder: 'E.g. temp.md, .trash/**/*',
	filterRules: 'Filter rules',
	forRepairs: 'For repairs: switch back after one sync',
	headerKeyPlaceholder: 'Header key',
	headerValuePlaceholder: 'Header value',
	help: 'Setup guide and every setting explained',
	helpAndSupport: 'Help and support',
	helpAndSupportDescription: 'Setup guide, bug reports and feature requests.',
	hide: 'Hide',
	idle: 'Idle',
	importAction: 'Import',
	importSettings: 'Import settings',
	importSettingsDescription: 'Paste an export from another device.',
	importSummary: ({ changes, hasSecrets }) =>
		`${changes === 0 ? 'No setting changes' : pc(changes, 'setting changes', 'settings change')}${hasSecrets ? ', plus the Google account (needs the passphrase)' : ''}.`,
	includeAccount: 'Include the Google account',
	includeAccountDescription:
		'The client secret and sign-in, sealed with the passphrase below. Anyone with the export and the passphrase gets full access to that Drive.',
	includeInSync: 'Include in sync',
	includedInSync: 'Included in sync again:',
	inclusionRules: 'Inclusion rules',
	inclusionRulesDescription: () =>
		createFragment((frag) => {
			frag.appendText('Glob patterns that sync even when an exclusion rule matches.');
		}),
	keepLocal: 'Keep local',
	keepLocalDescription: 'The vault version overwrites Drive.',
	keepLocalWarning: 'The Drive version is replaced without asking.',
	keepRemote: 'Keep remote',
	keepRemoteDescription: 'The Drive version overwrites the vault.',
	keepRemoteWarning: 'The vault version is replaced without asking.',
	keepThem: 'Keep them',
	lastSync: 'Last sync',
	lastSyncNever: 'No sync on this device yet.',
	lastSyncValue: ({ time, result }) => `${time} · ${result}`,
	latestSurvive: 'Latest survives',
	latestSurviveDescription:
		'The newer modified time wins. A device with a wrong clock can pick the old edit.',
	latestSurviveWarning: 'The older edit is replaced without asking.',
	massChangeMessage: ({ changes, percent }) =>
		`This sync would change ${pc(changes, 'file', 'files')} that were already in sync (${percent}% of the vault). That usually means a wrong setting or a problem rather than edits. Stop to look first, or continue if you expected it.`,
	massChangeTitle: 'Change many files?',
	massDeleteMessage: ({ local, remote }) =>
		`This sync would delete ${pc(local, 'file', 'files')} in the vault and ${pc(remote, 'file', 'files')} on Google Drive. That is more than usual, so nothing is deleted without your answer. Keep them to copy them back to the side they were removed from.`,
	massDeleteTitle: 'Delete many files?',
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
	mirrorLocalDescription: 'Drive becomes a copy of this vault. Files only on Drive are deleted.',
	mirrorLocalWarning:
		'Files only on Drive are deleted. Switch back to Bidirectional after one sync.',
	mirrorRemote: 'Mirror remote',
	mirrorRemoteDescription:
		'This vault becomes a copy of Drive. Files only in the vault are deleted.',
	mirrorRemoteWarning:
		'Files only in this vault are deleted. Switch back to Bidirectional after one sync.',
	miscellaneous: 'Miscellaneous',
	moveLocal: 'Move local',
	moveRemote: 'Move remote',
	neverDeleteRemote: 'Never delete on Drive',
	neverDeleteRemoteDescription:
		'Files deleted in the vault stay on Google Drive and are not downloaded again.',
	noHeaderConfigured: 'No header configured.',
	noRuleConfigured: 'No rule configured.',
	none: 'None',
	notAnExport: 'This is not a Drive Bridge settings export.',
	nothingLost: 'Nothing lost',
	noticeStatusOnMobile: 'Notice sync status on mobile',
	noticeStatusOnMobileDescription:
		'Show sync progress as a notice on mobile, where there is no status bar.',
	open: 'Open',
	passphrase: 'Passphrase',
	passphraseDescription:
		'At least 8 characters. Needed again on the other device; it is not stored.',
	passphraseMismatch: 'The passphrases do not match.',
	passphraseTooShort: 'Use a passphrase of at least 8 characters.',
	pasteExport: 'Paste the exported settings here',
	pauseAutomaticSync: 'Pause automatic sync',
	pauseAutomaticSyncDescription:
		'Skip every automatic sync on this device until turned off. Manual syncs still run.',
	pluginVersion: (version) => `Drive Bridge ${version}`,
	problemReportCopied:
		'Problem report copied. Paste it into a Bug report; check it first, it includes your filter rules and recent log lines.',
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
	renameAndKeepBothDescription: 'The newer edit keeps the name; the other is saved beside it.',
	renameAndKeepBothExample: 'note.md edited on two devices → note.md + note.conflict.md',
	repeatPassphrase: 'Repeat passphrase',
	replaceAccount: 'Replace',
	replaceAccountConfirm:
		'This device is already connected. Importing replaces its Google account with the one in the export.',
	replacesOneVersion: 'Replaces one version',
	reportBug: 'Report a bug. Nothing is sent until you submit it on GitHub.',
	requestFeature: 'Request a feature. Nothing is sent until you submit it on GitHub.',
	reservedHeader:
		'That header is set by the plugin itself; overriding it would break every request.',
	resetToDefaults: 'Reset to defaults',
	resetToDefaultsConfirm:
		'Every setting goes back to its default, including filter rules, strategies, automatic sync, controls and webhooks. The Google account, OAuth client, base directory and sync records are kept.',
	resetToDefaultsDescription:
		'Everything except the Google account, OAuth client and base directory goes back to its default.',
	resolveConflict: 'Resolve conflict',
	resumeAutomaticSync: 'Resume automatic sync',
	retry: 'Retry',
	retrySkippedFiles: 'Retry skipped files',
	saveToVault: 'Save to vault',
	scheduledSync: 'Scheduled sync',
	scheduledSyncDescription: 'Sync at the interval in the field.',
	scheduledSyncPlaceholder: 'Enter interval (e.g. 10min, 0.5h)',
	selectAll: 'Select all',
	settingsImported: 'Settings imported.',
	settingsReset: 'Settings reset to defaults',
	showProgress: 'Show progress',
	skip: 'Skip',
	skipDescription: 'Nothing changes; the conflict comes back on the next sync.',
	skippedFiles: 'Skipped files',
	skippedFilesCleared: 'Skipped files will be tried again on the next sync.',
	skippedFilesDescription: (count) =>
		count
			? `${pc(count, 'file keeps', 'files keep')} failing and ${count === 1 ? 'is' : 'are'} left out of syncs.`
			: 'No file is being skipped.',
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
	syncOverdue: 'no sync for a while',
	syncProgress: 'Sync progress',
	syncStrategy: 'Sync strategy',
	syncStrategyDescription: 'How changes flow between this vault and Drive.',
	syncThisFile: 'Sync this file',
	undo: 'Undo',
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
	wrongPassphrase: 'Wrong passphrase, or the export was changed.',
	xConfigured: (count) => `${count} configured`,
	xOfYOn: ({ on, total }) => `${on} of ${total} on`,
	xSelected: (count) => `(${count} selected)`,
};

export default en;
