import type { GdriveTranslations } from './translations';

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
	clientFromJson: 'Client ID and secret filled in from the downloaded JSON.',
	clientId: 'OAuth client ID',
	clientIdDescription: 'From your Google Cloud project. Saved in plugin settings.',
	clientIdMissing: 'Client ID missing',
	clientIdNeeded:
		'Missing on this device, which is connected. Paste the client ID from your Google Cloud project, or the connection stops when the token needs refreshing.',
	clientSecret: 'OAuth client secret',
	clientSecretDescription:
		"From the same client. Kept in this device's secure storage, never synced.",
	clientSecretMissing: 'Client secret missing',
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectAccount: 'Refresh token',
	connectAccountDescription: () =>
		createFragment((frag) => {
			frag.appendText('Have one? Paste it and press Connect. A token from ');
			frag.createEl('code', { text: 'rclone authorize "drive"' });
			frag.appendText(
				' works too. After Sign in with Google, paste the address the browser ends on here. Kept in secure storage.',
			);
		}),
	connectFirst: 'Connect your Google account first.',
	connectPrompt: 'Connect your Google account',
	connectPromptDescription: 'Start here: Drive Bridge syncs with a folder in your Google Drive.',
	connectSuccess: 'Connected to Google Drive.',
	connected: 'Connected',
	connection: 'Connection',
	connectionDescription: "Checks that Google Drive answers with this device's sign-in.",
	connectionUsage: ({ used, limit }) =>
		`${used} of ${limit} used on Google Drive. Test connection checks this device's sign-in.`,
	create: 'Create',
	disconnect: 'Forget on this device',
	driveAlmostFull: ({ used, limit }) =>
		`Google Drive is almost full: ${used} of ${limit} used. Uploads fail once it is full; free some space in Drive.`,
	enterClientId: 'Enter the OAuth client ID first.',
	enterClientSecret: 'Enter the OAuth client secret first.',
	enterRefreshToken: 'Paste a refresh token first.',
	errorAccountRead: (status) => `Could not read the Google account: HTTP ${status}`,
	errorAuthExpired:
		'Google Drive authorization expired or was revoked, please reconnect your Google account in the settings.',
	errorNoClient: 'Enter the OAuth client ID and client secret in the settings.',
	errorNoRefreshToken: 'Google returned no refresh token.',
	errorNotConnected: 'Connect a Google account in the settings first.',
	errorOtherAccount: (email) =>
		`This device is signed in to Google as ${email || 'another account'}, not the account this vault syncs with. Connect the account again in the settings.`,
	errorTokenRefresh: (reason) => `Google Drive token refresh failed: ${reason}`,
	folderCreateFailed: 'Could not create the Drive folder',
	folderListFailed: 'Could not read Drive folders',
	folderNameSlash: 'A folder name cannot contain a slash.',
	gdrive: 'Google Drive',
	googleAccount: 'Google account',
	guide: 'Guide',
	guideLabelDescription: 'Step-by-step instructions.',
	invalidRefreshToken: 'That does not look like a refresh token or rclone token output.',
	limitedScope:
		'This token only has limited Drive access (drive.file). Create it with rclone\'s default "drive" scope.',
	myDrive: 'My Drive',
	newFolder: 'Create folder',
	newFolderPrompt: 'New folder name',
	noSubfolders: 'No folders here yet.',
	openConsole: 'Open',
	or: 'or',
	pickFolder: 'Browse Drive folders',
	pickFolderTitle: 'Choose a Drive folder',
	pickSubfolder: 'Open a folder first; the whole Drive cannot be the vault folder.',
	refreshTokenPlaceholder: 'Address from the browser, or a token',
	remoteScan: 'Drive scan',
	remoteScanChanges: 'Changes only',
	remoteScanDescription:
		'Changes only asks Drive what changed since the last sync, much faster on a large Drive. It still lists everything once a day and whenever Drive cannot say what changed.',
	remoteScanFull: 'Full scan',
	setUpAnotherDevice: 'Set up another device',
	setUpAnotherDeviceDescription:
		'Export these settings, with the Google account encrypted by a passphrase. On the new device, use Set up from another device.',
	setUpFromDevice: 'Set up from another device',
	setUpFromDeviceDescription:
		'Import the settings exported on a device that is already connected, with its passphrase.',
	setupPage: 'Set up a Google client',
	setupPageDescription: 'No client yet? Four one-time steps in Google Cloud.',
	setupSteps: () =>
		createFragment((frag) => {
			frag.appendText(
				'Drive Bridge uses your own Google Cloud OAuth client (details in the ',
			);
			frag.createEl('a', {
				attr: { href: SETUP_GUIDE_URL },
				text: 'setup guide',
			});
			frag.appendText(
				'). Four one-time steps; then go back and fill in the client ID and secret.',
			);
		}),
	signInDenied: 'Google access was not allowed. Sign in again and choose Allow.',
	signInOpened:
		'Google opened in your browser. After you allow access, the page fails to load: copy its address and paste it under Refresh token.',
	signInStartAgain: 'That address is from another sign-in. Press Sign in with Google again.',
	signInWithGoogle: 'Sign in with Google',
	signInWithGoogleDescription:
		'No token? Opens Google in your browser to allow access with the client above, then paste the address it ends on under Refresh token. No terminal needed.',
	stepClient: 'Create a Desktop client',
	stepClientDescription:
		'Application type Desktop app. Download the JSON and paste it into the client ID below, or copy the ID and secret.',
	stepConsent: 'Set up the consent screen',
	stepConsentDescription:
		'App name and your email. Then under Audience choose External and press Publish app, or tokens expire after 7 days.',
	stepDriveApi: 'Enable the Google Drive API',
	stepDriveApiDescription: 'In the new project, open the Drive API page and press Enable.',
	stepProject: 'Create a Google Cloud project',
	stepProjectDescription: 'Any name. Use the Google account whose Drive should hold the vault.',
	stepSignInDescription:
		'With the client ID and secret filled in on the Google account page. Then paste the address the browser ends on under Refresh token.',
	tapToConnect: 'Tap to connect',
	testConnection: 'Test connection',
	useThisFolder: 'Use this folder',
	useTrash: 'Delete to trash',
	useTrashDescription: "Deleted files go to Drive's trash for 30 days instead of being removed.",
};

export default en;
