import type { Fragment, Snippet } from '@/modules/i18n';
import type { CheckConnectionTranslations } from '@/settings/check-connection';
import type { AuthTranslations } from './auth';
import type { BaseDirectoryTranslations } from './base-directory-setting';
import type { ConnectedRowsTranslations } from './connected-rows';
import type { RemoteScanTranslations } from './remote-scan-setting';
import type { SetupPageTranslations } from './setup-page';

export type GdriveTranslations = AuthTranslations &
	BaseDirectoryTranslations &
	RemoteScanTranslations &
	SetupPageTranslations &
	Omit<ConnectedRowsTranslations, keyof CheckConnectionTranslations | 'exportSettings'> & {
		gdrive: string;
		connectAccount: string;
		accountConnected: string;
		accountConnectedDescription: Snippet<string>;
		connectAccountDescription: Fragment;
		connect: string;
		connected: string;
		googleAccount: string;
		clientIdMissing: string;
		clientSecretMissing: string;
		clickToConnect: string;
		tapToConnect: string;
		disconnect: string;
		configureFirst: string;
		connectSuccess: string;
		useTrash: string;
		useTrashDescription: string;
		authorizationFailed: Snippet<string>;
		clientId: string;
		clientIdDescription: string;
		clientIdNeeded: string;
		clientSecret: string;
		clientSecretDescription: string;
		connectFirst: string;
		or: string;
		driveAlmostFull: Snippet<{ used: string; limit: string }>;
		connectPrompt: string;
		connectPromptDescription: string;
		enterClientId: string;
		enterClientSecret: string;
		enterRefreshToken: string;
		invalidRefreshToken: string;
		limitedScope: string;
		refreshTokenPlaceholder: string;
		signInWithGoogle: string;
		setUpFromDevice: string;
		setUpFromDeviceDescription: string;
		clientFromJson: string;
		signInWithGoogleDescription: string;
		signInOpened: string;
		signInStartAgain: string;
		signInDenied: string;
	};
