import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

const notices: Array<[unknown, number | undefined]> = [];
void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: function Notice(message: unknown, duration?: number) {
		notices.push([message, duration]);
	},
}));

const { VERSION } = await import('@/modules/event-bus');
const { noteUpdate, releaseNotesUrl } = await import('@/modules/whats-new');

function device(shown?: unknown) {
	const local = new Map<string, unknown>();
	if (shown !== undefined) local.set('drive-bridge-last-version', shown);
	const app = {
		loadLocalStorage: (key: string) => local.get(key),
		saveLocalStorage: (key: string, value: unknown) => void local.set(key, value),
	};
	const translated: Array<unknown> = [];
	const translate = (key: string, arg: unknown) => {
		translated.push([key, arg]);
		return key;
	};
	notices.length = 0;
	return { app, ctx: { app, translate } as never, local, translated };
}

test('release notes link to this version on GitHub', () => {
	expect(releaseNotesUrl('1.2.3')).toBe(
		'https://github.com/mmayadag/drive-bridge/releases/tag/1.2.3',
	);
	expect(releaseNotesUrl()).toEndWith(`/tag/${VERSION}`);
});

test('a fresh install remembers the version and shows nothing', () => {
	const { ctx, local } = device();
	noteUpdate(ctx);
	expect(notices).toStrictEqual([]);
	expect(local.get('drive-bridge-last-version')).toBe(VERSION);
});

test('after an update, the notice shows once and links to the notes', () => {
	const { ctx, local, translated } = device('0.0.1');
	noteUpdate(ctx);
	expect(translated).toStrictEqual([['updatedTo', { url: releaseNotesUrl(), version: VERSION }]]);
	expect(notices).toStrictEqual([['updatedTo', 15_000]]);
	expect(local.get('drive-bridge-last-version')).toBe(VERSION);

	noteUpdate(ctx);
	expect(notices).toHaveLength(1);
});
