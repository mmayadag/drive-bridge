import type { GdriveTranslations } from './setting';

const en: GdriveTranslations = {
	accountConnected: 'Account connected',
	accountConnectedDescription: (email) =>
		email ? `Connected as ${email}.` : 'Connected to Google Drive.',
	authorizationFailed: (reason) => `Authorization failed: ${reason}`,
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Set the folder in Google Drive that holds this vault. Created automatically on the first sync and do not create it manually in Drive. Files added outside this plugin are invisible to sync.',
	baseDirectoryPlaceholder: 'my-vault/',
	clientId: 'OAuth client ID',
	clientIdDescription:
		"From your own Google Cloud project. Saved in this vault's plugin settings.",
	clientSecret: 'OAuth client secret',
	clientSecretDescription:
		"From the same OAuth client. Kept in this device's secure storage, never in synced files.",
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectAccount: 'Connect account',
	connectAccountDescription: () =>
		createFragment((frag) => {
			frag.appendText('On a computer, run ');
			frag.createEl('code', { text: 'rclone authorize "drive" <client ID> <client secret>' });
			frag.appendText(
				" and paste the token it prints. Stored in this device's secure storage.",
			);
		}),
	connectSuccess: 'Connected to Google Drive.',
	disconnect: 'Forget on this device',
	gdrive: 'Google Drive',
	invalidRefreshToken: 'That does not look like a refresh token or rclone token output.',
	limitedScope:
		'This token only has limited Drive access (drive.file). Create it with rclone\'s default "drive" scope.',
	refreshTokenPlaceholder: 'Refresh token or rclone output',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move deleted files to the Google Drive trash instead of deleting them permanently. Drive clears its trash after 30 days.',
};

export default en;
