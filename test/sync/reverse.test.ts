import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import type { BaseTask } from '@/sync';
import reverseTask, { reverseTasks } from '@/sync/reverse';
import CreateLocalDir from '@/sync/tasks/create-local-dir';
import CreateRemoteDir from '@/sync/tasks/create-remote-dir';
import Download from '@/sync/tasks/download';
import MoveLocal from '@/sync/tasks/move-local';
import RemoveLocal from '@/sync/tasks/remove-local';
import RemoveRemote from '@/sync/tasks/remove-remote';
import Upload from '@/sync/tasks/upload';

const { bytes, file, folder, fs } = testKit;

function base() {
	const local = fs({ control: { read: () => bytes('vault text') } });
	const remote = fs({ control: { read: () => bytes('drive text') } });
	const records = new Map<string, unknown>();
	const record = {
		delete: (key: string) => Promise.resolve(void records.delete(key)),
		set: (key: string, value: unknown) => Promise.resolve(void records.set(key, value)),
	};
	return {
		local,
		options: { localFs: local.fs, record: record as never, remoteFs: remote.fs },
		records,
		remote,
	};
}

const shape = (task: BaseTask | undefined) =>
	task && { key: task.key, local: task.local, name: task.name, remote: task.remote };

test('each change reverses to keeping the other side', () => {
	const { options } = base();
	const local = file('a.md', { uid: 'l' });
	const remote = file('a.md', { uid: 'r' });
	const cases: Array<[BaseTask, string]> = [
		[new Upload({ ...options, key: 'a.md', local, remote }), 'download'],
		[new Download({ ...options, key: 'a.md', local, remote }), 'upload'],
		[new RemoveLocal({ ...options, key: 'a.md', local }), 'upload'],
		[new RemoveRemote({ ...options, key: 'a.md', remote }), 'download'],
		[new RemoveLocal({ ...options, key: 'f/', local: folder('f/') }), 'createRemoteDir'],
		[new RemoveRemote({ ...options, key: 'f/', remote: folder('f/') }), 'createLocalDir'],
	];
	for (const [task, reversed] of cases) {
		const opposite = reverseTask(task);
		expect(opposite?.name).toBe(reversed as never);
		expect(shape(opposite)).toMatchObject({ key: task.key });
	}
	expect(reverseTask(cases[4][0])).toBeInstanceOf(CreateRemoteDir);
	expect(reverseTask(cases[5][0])).toBeInstanceOf(CreateLocalDir);
});

test('with nothing on the other side there is nothing to keep', () => {
	const { options } = base();
	const newFile = file('new.md');
	expect(reverseTask(new Upload({ ...options, key: 'new.md', local: newFile }))).toBeUndefined();
	expect(
		reverseTask(new Download({ ...options, key: 'new.md', remote: newFile })),
	).toBeUndefined();
	expect(
		reverseTask(new MoveLocal({ ...options, key: 'b.md', oldKey: 'a.md', remote: newFile })),
	).toBeUndefined();
	expect(
		reverseTasks([
			new Upload({ ...options, key: 'new.md', local: newFile }),
			new RemoveRemote({ ...options, key: 'a.md', remote: newFile }),
		]).map((task) => task.name),
	).toStrictEqual(['download']);
});

test('an undone upload brings the Drive version into the vault', async () => {
	const { local, options, records, remote } = base();
	const upload = new Upload({
		...options,
		key: 'a.md',
		local: file('a.md', { uid: 'l' }),
		remote: file('a.md', { uid: 'r' }),
	});
	await reverseTask(upload)?.exec();
	expect(remote.calls.write).toHaveLength(0);
	expect(local.calls.write[0]?.[0]).toBe('a.md');
	expect(records.get('a.md')).toStrictEqual({ isDir: false, local: 'write-uid', remote: 'r' });
});
