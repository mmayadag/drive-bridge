import type { GdriveTranslations } from './setting';

const SETUP_GUIDE_URL = 'https://github.com/mmayadag/drive-bridge/blob/main/TECHNICAL.md#setup';

const en: GdriveTranslations = {
	accountConnected: 'Account connected',
	accountConnectedDescription: (email) =>
		email ? `Connected as ${email}.` : 'Connected to Google Drive.',
	authorizationFailed: (reason) => `Authorization failed: ${reason}`,
	baseDirectory: 'Base directory',
	baseDirectoryDescription: () =>
		createFragment((frag) => {
			frag.appendText(
				'The folder in Google Drive that holds this vault, created on the first sync. Every device syncing this vault must point at the same folder. ',
			);
			frag.createSpan({
				cls: 'drive-bridge-warning-text',
				text: 'Sync goes both ways: files already in the folder are downloaded into this vault, and deleting a note here deletes it in Drive. Use a folder that belongs to this vault alone, not your whole Drive.',
			});
		}),
	baseDirectoryPlaceholder: 'my-vault/',
	cancel: 'Cancel',
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
	connectFirst: 'Connect your Google account first.',
	connectSuccess: 'Connected to Google Drive.',
	create: 'Create',
	disconnect: 'Forget on this device',
	folderListFailed: 'Could not read Drive folders',
	folderNameSlash: 'A folder name cannot contain a slash.',
	gdrive: 'Google Drive',
	invalidRefreshToken: 'That does not look like a refresh token or rclone token output.',
	limitedScope:
		'This token only has limited Drive access (drive.file). Create it with rclone\'s default "drive" scope.',
	myDrive: 'My Drive',
	newFolder: 'Create folder',
	newFolderPrompt: 'New folder name',
	noSubfolders: 'No folders here yet.',
	pickFolder: 'Browse Drive folders',
	pickFolderTitle: 'Choose a Drive folder',
	pickSubfolder: 'Open a folder first; the whole Drive cannot be the vault folder.',
	refreshTokenPlaceholder: 'Refresh token or rclone output',
	setupSteps: () =>
		createFragment((frag) => {
			frag.appendText(
				'Drive Bridge uses your own Google Cloud OAuth client, so your vault is not shared with anyone else. Two one-time steps: create a "Desktop app" OAuth client with the Drive API enabled, then get a refresh token for it. The ',
			);
			frag.createEl('a', {
				attr: { href: SETUP_GUIDE_URL },
				text: 'setup guide',
			});
			frag.appendText(
				' walks through both, with three ways to get the token. Paste the results below.',
			);
		}),
	useThisFolder: 'Use this folder',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move deleted files to the Google Drive trash instead of deleting them permanently. Drive clears its trash after 30 days.',
};

export default en;
