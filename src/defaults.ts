import type { Settings } from '@';

/** What a fresh install uses, and what Reset to defaults goes back to. */
export function defaultSettings(configDir: string): Settings {
	return {
		avoidAutoSyncWhenOffline: true,
		confirmDeleteInAutoSync: true,
		confirmTasksInSync: true,
		conflictResolver: 'renameAndKeepBoth',
		customHeaders: [],
		decider: 'bidirectional',
		exclusionRules: [
			'.git',
			'.github',
			'.gitlab',
			'.svn',
			'node_modules',
			'.DS_Store',
			'__MACOSX',
			'desktop.ini',
			'Thumbs.db',
			'~$*.doc',
			'~$*.docx',
			'~$*.ppt',
			'~$*.pptx',
			'~$*.xls',
			'~$*.xlsx',
			'.trash',
			'Drive Bridge Logs',
			configDir,
		].map((expr) => ({ caseSensitive: false, expr })),
		exportLogsDirectory: 'Drive Bridge Logs/',
		inclusionRules: [],
		keptOnRemote: {},
		maxFileSize: { enabled: false, value: 31_457_280 },
		maxMemoryConsumption: { enabled: true, value: 100 * 1024 ** 2 },
		maxRequestConcurrency: { enabled: true, value: 50 },
		minRequestInterval: { enabled: false, value: 0 },
		modules: {},
		neverDeleteRemote: false,
		noticeStatusOnMobile: true,
		realtimeSync: { enabled: false, value: 5000 },
		realtimeSyncFastMode: true,
		remoteFs: 'gdrive',
		scheduledSync: { enabled: true, value: 15 * 60 * 1000 },
		startupSync: { enabled: true, value: 5000 },
		syncOnLeave: true,
		webhookOnFinish: '',
		webhookOnStart: '',
		webhookOnlyWhenChanged: true,
	};
}

/**
 * Puts every setting back to its default, except what ties this device to its account
 * and folder: the backend, module settings (each module resets its own), files kept on
 * Drive and the last sync result.
 */
export function resetSettings(settings: Settings, configDir: string) {
	// Kept-on-Drive marks are state, not a preference: dropping them would download every
	// kept file again.
	const { modules, remoteFs, lastSync, keptOnRemote } = settings;
	Object.assign(settings, defaultSettings(configDir), { keptOnRemote, modules, remoteFs });
	if (lastSync) settings.lastSync = lastSync;
}
