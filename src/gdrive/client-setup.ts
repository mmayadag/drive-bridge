/** Google Cloud Console pages for the one-time client setup, in order. */
export const SETUP_STEPS = [
	{ key: 'stepProject', url: 'https://console.cloud.google.com/projectcreate' },
	{
		key: 'stepDriveApi',
		url: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
	},
	{ key: 'stepConsent', url: 'https://console.cloud.google.com/auth/branding' },
	{ key: 'stepClient', url: 'https://console.cloud.google.com/auth/clients/create' },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]['key'];

const CLIENT_ID = /^\d+-[\da-z]+\.apps\.googleusercontent\.com$/u;

/** Whether the text looks like a Google OAuth client ID. */
export function isClientId(text: string) {
	return CLIENT_ID.test(text.trim());
}

type ClientJson = { client_id?: unknown; client_secret?: unknown };

/**
 * Reads the client_secret.json Google Cloud offers to download for a client, pasted as it
 * is. Undefined for anything else.
 */
export function parseClientJson(text: string) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (!parsed || typeof parsed !== 'object') return;
	const root = parsed as ClientJson & { installed?: ClientJson; web?: ClientJson };
	const client = root.installed ?? root.web ?? root;
	const { client_id: clientId, client_secret: clientSecret } = client;
	if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return;
	return { clientId, clientSecret };
}
