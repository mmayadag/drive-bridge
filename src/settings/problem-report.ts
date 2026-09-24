// A problem report for the Bug form: versions, settings without secrets or private
// values, the last sync and the end of the log. Built on the device and copied to the
// clipboard; the plugin sends it nowhere.

const LOG_LINES = 300;
const SET = '<set>';

type Settings = Record<string, unknown> & { modules?: Record<string, Record<string, unknown>> };

const mark = (value: unknown) => (value ? SET : '');

/** A copy of the settings with secrets, addresses and file names replaced or counted. */
export function sanitizeSettings(settings: Settings): Record<string, unknown> {
	const copy = structuredClone(settings);
	for (const key of ['webhookOnStart', 'webhookOnFinish'])
		if (key in copy) copy[key] = mark(copy[key]);
	if (Array.isArray(copy.customHeaders))
		copy.customHeaders = (copy.customHeaders as Array<{ key: string; type: string }>).map(
			({ key, type }) => ({ key, type, value: SET }),
		);
	const kept = copy.keptOnRemote as Record<string, string> | undefined;
	if (kept) copy.keptOnRemote = `${Object.keys(kept).length} file(s)`;
	const skip = copy.skipState as { skipped?: Array<string> } | undefined;
	if (skip) copy.skipState = `${skip.skipped?.length ?? 0} file(s) skipped`;
	// Raw errors can name files; the report keeps results and counts.
	if (Array.isArray(copy.syncHistory))
		copy.syncHistory = (copy.syncHistory as Array<Record<string, unknown>>)
			.slice(0, 10)
			.map(({ error: _error, ...rest }) => rest);
	const gdrive = copy.modules?.gdrive;
	if (gdrive)
		for (const key of ['clientId', 'accountEmail', 'userId'])
			if (key in gdrive) gdrive[key] = mark(gdrive[key]);
	return copy;
}

export function buildReport(input: {
	plugin: string;
	obsidian: string;
	platform: string;
	settings: Settings;
	log: string;
}) {
	const tail = input.log.split('\n').slice(-LOG_LINES).join('\n');
	return [
		'## Environment',
		'',
		`- Drive Bridge: ${input.plugin}`,
		`- Obsidian: ${input.obsidian}`,
		`- Platform: ${input.platform}`,
		'',
		'## Settings (secrets removed)',
		'',
		'```json',
		JSON.stringify(sanitizeSettings(input.settings), undefined, 2),
		'```',
		'',
		`## Log (last ${LOG_LINES} lines)`,
		'',
		'```',
		tail,
		'```',
	].join('\n');
}
