// The Development row that lets a device forget its vault-folder tag (#228).

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import { ADVANCED, MORE, PAGE } from '@/settings/layout';

const notices: Array<string> = [];
function NoticeSpy(message: string) {
	notices.push(message);
}

void mock.module('obsidian', () => ({ ...ObsidianMock, Notice: NoticeSpy }));

type ConfirmOptions = {
	title: string;
	message: string;
	confirm: string;
	cancel: string;
	onConfirm: () => unknown;
};
const modals: Array<ConfirmOptions> = [];
class ConfirmModalSpy {
	opened = false;
	constructor(
		_app: unknown,
		private readonly options: ConfirmOptions,
	) {
		modals.push(options);
	}
	open() {
		this.opened = true;
	}
}

void mock.module('@/components/confirm-modal', () => ({ default: ConfirmModalSpy }));

const { default: forgetVaultTagSetting } = await import('@/gdrive/forget-vault-tag-setting');

function fakeButton() {
	let onClickHandler: (() => unknown) | undefined;
	const button = {
		onClick: (fn: () => unknown) => {
			onClickHandler = fn;
			return button;
		},
		setButtonText: () => button,
		setDestructive: () => button,
		trigger: () => onClickHandler?.(),
	};
	return button;
}

function fakeDB(initial?: string) {
	let vaultId = initial;
	return {
		db: {
			getMeta: () => Promise.resolve(vaultId),
			getStore: () => ({}) as never,
			setMeta: (_key: 'gdriveVaultId', value: string) => {
				vaultId = value;
				return Promise.resolve();
			},
		},
		vaultId: () => vaultId,
	};
}

type RenderableSetting = { render: (setting: never) => void };

function row(indexedDB: ReturnType<typeof fakeDB>['db']) {
	const tree = forgetVaultTagSetting({
		app: {} as never,
		indexedDB,
		translate: ((key: string) => key) as never,
	}) as never as {
		[MORE]: {
			[PAGE.advanced]: {
				[ADVANCED.development]: Record<number, () => RenderableSetting>;
			};
		};
	};
	return tree[MORE][PAGE.advanced][ADVANCED.development][1700]();
}

test('opens a confirm modal, and confirming forgets this device’s tag', async () => {
	modals.length = 0;
	const { db, vaultId } = fakeDB('vault-1');
	const button = fakeButton();
	row(db).render({ addButton: (cb: (b: typeof button) => void) => cb(button) } as never);

	button.trigger();
	expect(modals).toHaveLength(1);
	expect(modals[0]?.title).toBe('forgetVaultTag');

	await modals[0]?.onConfirm();
	expect(vaultId()).toBe('');
	expect(notices).toContain('vaultTagForgotten');
});
