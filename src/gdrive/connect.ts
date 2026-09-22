import { getMessage } from '@/shared/error';
import type { Account, TokenManager } from './auth';
import { fetchAccount, parseRefreshToken } from './auth';

class LimitedScopeError extends Error {
	override name = 'LimitedScopeError';
}

export type ConnectResult =
	| { status: 'connected'; account: Account }
	| { status: 'noClient' }
	| { status: 'badToken' }
	| { status: 'limitedScope' }
	| { status: 'failed'; reason: string };

/**
 * Verifies a pasted refresh token before keeping it: refresh it with the user's client,
 * check the grant covers full Drive, then read the account. The previous token is only
 * replaced once all of that succeeds.
 */
export async function connectWithToken(
	manager: TokenManager,
	input: string,
): Promise<ConnectResult> {
	if (!manager.hasCredentials()) return { status: 'noClient' };
	const refreshToken = parseRefreshToken(input);
	if (!refreshToken) return { status: 'badToken' };

	const previous = manager.getRefreshToken();
	manager.setRefreshToken(refreshToken);
	manager.invalidate();
	try {
		const accessToken = await manager.getToken(true);
		if (!manager.hasFullDriveScope()) throw new LimitedScopeError();
		const account = await fetchAccount(accessToken);
		return { account, status: 'connected' };
	} catch (error) {
		if (previous) manager.setRefreshToken(previous);
		else manager.deleteRefreshToken();
		manager.invalidate();
		if (error instanceof LimitedScopeError) return { status: 'limitedScope' };
		return { reason: getMessage(error), status: 'failed' };
	}
}

export type MissingInput = 'clientId' | 'clientSecret' | 'token';

/**
 * The first field Connect still needs, in the order the settings show them, so
 * the user is sent to the top-most empty one rather than to Google.
 */
export function findMissingInput(values: {
	clientId: string;
	clientSecret: string;
	token: string;
}): MissingInput | undefined {
	if (!values.clientId.trim()) return 'clientId';
	if (!values.clientSecret.trim()) return 'clientSecret';
	if (!values.token.trim()) return 'token';
	return undefined;
}
