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
				'Drive folder for this vault, created on the first sync. Use the same one on every device. ',
			);
			frag.createSpan({
				cls: 'drive-bridge-warning-text',
				text: 'Sync goes both ways, so use a folder for this vault only.',
			});
		}),
	baseDirectoryPlaceholder: 'my-vault/',
	cancel: 'Cancel',
	clickToConnect: 'Click to connect',
	clientId: 'OAuth client ID',
	clientIdDescription: 'From your Google Cloud project. Saved in plugin settings.',
	clientIdMissing: 'Client ID missing',
	clientSecret: 'OAuth client secret',
	clientSecretDescription:
		"From the same client. Kept in this device's secure storage, never synced.",
	clientSecretMissing: 'Client secret missing',
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectAccount: 'Connect account',
	connectAccountDescription: () =>
		createFragment((frag) => {
			frag.appendText('Run ');
			frag.createEl('code', { text: 'rclone authorize "drive" <client ID> <client secret>' });
			frag.appendText(' on a computer and paste the token. Kept in secure storage.');
		}),
	connectFirst: 'Connect your Google account first.',
	connectSuccess: 'Connected to Google Drive.',
	connected: 'Connected',
	create: 'Create',
	disconnect: 'Forget on this device',
	enterClientId: 'Enter the OAuth client ID first.',
	enterClientSecret: 'Enter the OAuth client secret first.',
	enterRefreshToken: 'Paste a refresh token first.',
	folderListFailed: 'Could not read Drive folders',
	folderNameSlash: 'A folder name cannot contain a slash.',
	gdrive: 'Google Drive',
	googleAccount: 'Google account',
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
				'Drive Bridge uses your own Google Cloud OAuth client. Create a "Desktop app" client with the Drive API enabled and get a refresh token for it (see the ',
			);
			frag.createEl('a', {
				attr: { href: SETUP_GUIDE_URL },
				text: 'setup guide',
			});
			frag.appendText('), then fill in the fields below.');
		}),
	tapToConnect: 'Tap to connect',
	useThisFolder: 'Use this folder',
	useTrash: 'Delete to trash',
	useTrashDescription: "Deleted files go to Drive's trash for 30 days instead of being removed.",
};

export default en;
