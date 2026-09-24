// The backend connection-check icon: caches a success, retries silently on a background
// failure, and surfaces a Notice only when the user forces a re-check. No real DOM is
// available in this test environment, so `setting`/`button` are duck-typed to just what
// check-connection.ts touches.

import ObsidianMock from '$/support/obsidian-mock';
import { beforeEach, expect, mock, test } from 'bun:test';
import { openMemoryDB } from '@/shared/key-value-store';

const notices: Array<{ message: string; timeout?: number }> = [];

function NoticeSpy(message: string, timeout?: number) {
	notices.push({ message, timeout });
}

void mock.module('obsidian', () => ({
	...ObsidianMock,
	Notice: NoticeSpy,
}));

beforeEach(() => {
	notices.length = 0;
});

const { addCheckConnection } = await import('@/settings/check-connection');

type FakeElement = { addClass: () => void; addClasses: () => void; removeClasses: () => void };

function fakeButton() {
	const calls: { setIcon: Array<string> } = { setIcon: [] };
	let onClickHandler: (() => void) | undefined;
	const element: FakeElement = {
		addClass: () => {},
		addClasses: () => {},
		removeClasses: () => {},
	};
	const button = {
		calls,
		extraSettingsEl: { firstElementChild: element as never },
		onClick: (fn: () => void) => {
			onClickHandler = fn;
			return button;
		},
		setIcon: (icon: string) => {
			calls.setIcon.push(icon);
			return button;
		},
		setTooltip: () => button,
		trigger: () => onClickHandler?.(),
	};
	return button;
}

function baseCtx(overrides: Record<string, unknown> = {}) {
	const memoryDB = openMemoryDB<Record<string, unknown>, { lastCheckedFs: string }>(
		`check-connection-test-${Math.random()}`,
	);
	return {
		dispatch: (() => {}) as never,
		getCheckConnection: (() => () => Promise.resolve({ success: true as const })) as never,
		memoryDB,
		settings: { remoteFs: 'gdrive' } as never,
		translate: ((key: string) => key) as never,
		...overrides,
	};
}

function render(ctx: ReturnType<typeof baseCtx>, when?: () => boolean) {
	const button = fakeButton();
	const setting = { addExtraButton: (cb: (b: typeof button) => void) => cb(button) };
	const checks = addCheckConnection(setting as never, ctx as never, when);
	return { button, checks };
}

test('checks immediately by default and marks success', async () => {
	const ctx = baseCtx();
	const { button } = render(ctx);
	await Promise.resolve();
	await Promise.resolve();

	expect(button.calls.setIcon).toStrictEqual(['loader-circle', 'check']);
	expect(ctx.memoryDB.getMeta('lastCheckedFs')).toBe('gdrive');
});

test('skips the initial check when `when` returns false', () => {
	const { button } = render(baseCtx(), () => false);
	expect(button.calls.setIcon).toStrictEqual([]);
});

test('a cached match short-circuits to success without calling the checker', async () => {
	const ctx = baseCtx();
	ctx.memoryDB.setMeta('lastCheckedFs', 'gdrive');
	const getCheckConnection = () => () => {
		throw new Error('should not be called when the cached check matches');
	};
	const { button } = render({ ...ctx, getCheckConnection: getCheckConnection as never });
	await Promise.resolve();

	expect(button.calls.setIcon).toStrictEqual(['check']);
});

test('no remote configured fails without calling the checker', async () => {
	const getCheckConnection = () => () => {
		throw new Error('should not be called with no remote configured');
	};
	const { button } = render(baseCtx({ getCheckConnection, settings: { remoteFs: '' } }));
	await Promise.resolve();

	expect(button.calls.setIcon).toStrictEqual(['cloud-off']);
});

test('a background failure logs it but stays quiet otherwise', async () => {
	const logs: Array<string> = [];
	const ctx = baseCtx({
		dispatch: (_event: string, message: string) => void logs.push(message),
		getCheckConnection: () => () =>
			Promise.resolve({ reason: 'offline', success: false as const }),
	});
	const { button } = render(ctx);
	await Promise.resolve();
	await Promise.resolve();

	expect(button.calls.setIcon).toStrictEqual(['loader-circle', 'cloud-off']);
	expect(logs[0]).toContain('offline');
	expect(notices).toHaveLength(0);
});

test('a thrown error from the checker is treated as a failure', async () => {
	const logs: Array<string> = [];
	const ctx = baseCtx({
		dispatch: (_event: string, message: string) => void logs.push(message),
		getCheckConnection: () => () => {
			throw new Error('network down');
		},
	});
	const { button } = render(ctx);
	await Promise.resolve();
	await Promise.resolve();

	expect(button.calls.setIcon).toStrictEqual(['loader-circle', 'cloud-off']);
	expect(logs[0]).toContain('network down');
});

test('forcing a check surfaces a Notice on both success and failure', async () => {
	notices.length = 0;
	const succeeding = baseCtx();
	const { button, checks } = render(succeeding);
	await Promise.resolve();
	await Promise.resolve();
	notices.length = 0;
	await checks.check(true);
	expect(notices).toStrictEqual([{ message: 'checkConnectionSuccess', timeout: undefined }]);
	expect(button.calls.setIcon.at(-1)).toBe('check');

	notices.length = 0;
	const failing = baseCtx({
		getCheckConnection: () => () =>
			Promise.resolve({ reason: 'timeout', success: false as const }),
	});
	await render(failing).checks.check(true);
	expect(notices).toHaveLength(1);
	expect(notices[0]?.message).toContain('timeout');
	expect(notices[0]?.timeout).toBe(5000);
});

test('clicking the button forces a re-check', async () => {
	const ctx = baseCtx();
	ctx.memoryDB.setMeta('lastCheckedFs', 'gdrive');
	const { button } = render(ctx);
	await Promise.resolve();
	expect(button.calls.setIcon).toStrictEqual(['check']);

	button.trigger();
	await Promise.resolve();
	await Promise.resolve();
	// Forced, so the cached match is bypassed and the check actually runs.
	expect(button.calls.setIcon).toStrictEqual(['check', 'loader-circle', 'check']);
});

test('cleanup clears a pending retry timeout', async () => {
	const originalClear = window.clearTimeout;
	const cleared: Array<number | undefined> = [];
	window.clearTimeout = ((id?: number) => {
		cleared.push(id);
		return originalClear(id);
	}) as typeof window.clearTimeout;
	try {
		const ctx = baseCtx({
			getCheckConnection: () => () =>
				Promise.resolve({ reason: 'offline', success: false as const }),
		});
		const { checks } = render(ctx);
		await Promise.resolve();
		await Promise.resolve();
		checks.cleanup();
		expect(cleared).toHaveLength(1);
	} finally {
		window.clearTimeout = originalClear;
	}
});

test('a background failure retries on a timer, and the retry runs the check again', async () => {
	const originalSet = window.setTimeout;
	const scheduled: Array<() => void> = [];
	window.setTimeout = ((fn: () => void) => {
		scheduled.push(fn);
		return 0;
	}) as never;
	try {
		let calls = 0;
		const ctx = baseCtx({
			getCheckConnection: () => () => {
				calls += 1;
				return Promise.resolve(
					calls === 1
						? { reason: 'offline', success: false as const }
						: { success: true as const },
				);
			},
		});
		const { button } = render(ctx);
		await Promise.resolve();
		await Promise.resolve();
		expect(scheduled).toHaveLength(1);

		scheduled[0]?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(calls).toBe(2);
		expect(button.calls.setIcon.at(-1)).toBe('check');
	} finally {
		window.setTimeout = originalSet;
	}
});
