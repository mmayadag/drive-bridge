import testKit from '$/support/test-kit';
import { test, expect } from 'bun:test';
import prefixWrapper from '@/fs/wrappers/prefix';

const { bytes, file, fs: testFs, stream } = testKit;

test('base-dir shim rewrites keys relative to its base', async () => {
	const remote = testFs({ uid: 'remote' });
	const shim = prefixWrapper(remote.fs, '/base');

	expect(shim.getUid()).toBe('remote~base/');

	const rootStat = await shim.stat('/');
	const stat = await shim.stat('note.md');
	const list = await shim.list('/', () => 'include');
	const readStat = file('note.md', { size: 42 });
	const writeStat = file('note.md', { size: 7 });
	await shim.readStream('note.md', readStat);
	await shim.writeStream('note.md', stream([bytes('x')]), writeStat);

	expect(remote.calls.stat).toStrictEqual(['base/', 'base/note.md']);
	expect(rootStat).toStrictEqual({ isDir: true, key: '/' });
	expect(stat).toStrictEqual({ isDir: false, key: 'note.md', mtime: 10, size: 5, uid: 'uid' });
	expect(remote.calls.list).toStrictEqual(['base/']);
	expect(remote.calls.readStream).toStrictEqual([['base/note.md', readStat]]);
	expect(remote.calls.writeStream).toStrictEqual([['base/note.md', writeStat]]);
	expect(list).toStrictEqual([
		{ isDir: true, key: 'folder/' },
		{ isDir: false, key: 'folder/note.md', mtime: 12, size: 7, uid: 'note-2' },
	]);
});

test('read, write, delete, move, mkdir and exists all rewrite the key', async () => {
	const remote = testFs({ uid: 'remote' });
	const shim = prefixWrapper(remote.fs, '/base');
	const stat = file('note.md', { size: 3 });

	await shim.read('note.md', stat);
	await shim.write('note.md', bytes('x'), stat);
	await shim.delete('note.md');
	await shim.move('old.md', 'new.md');
	await shim.mkdir('folder/', true);
	await shim.exists('note.md');

	expect(remote.calls.read).toStrictEqual([['base/note.md', stat]]);
	expect(remote.calls.write[0]?.[0]).toBe('base/note.md');
	expect(remote.calls.delete).toStrictEqual(['base/note.md']);
	expect(remote.calls.move).toStrictEqual([['base/old.md', 'base/new.md']]);
	expect(remote.calls.mkdir).toStrictEqual(['base/folder/']);
	expect(remote.calls.exists).toStrictEqual(['base/note.md']);
});

test('a key outside the prefix refuses to unscope', () => {
	const remote = testFs({
		control: { stat: () => file('other/note.md') },
		uid: 'remote',
	});
	const shim = prefixWrapper(remote.fs, '/base');

	expect(shim.stat('note.md')).rejects.toThrow('out-of-scope path "other/note.md"');
});

test('an empty prefix passes keys through unchanged', async () => {
	const remote = testFs({ uid: 'remote' });
	const shim = prefixWrapper(remote.fs, '/');

	expect(shim.getUid()).toBe('remote~/');
	await shim.read('note.md', file('note.md'));
	expect(remote.calls.read).toStrictEqual([['note.md', file('note.md')]]);

	const rootStat = await shim.stat('/');
	expect(rootStat).toStrictEqual({ isDir: true, key: '/' });
});

test('list reports progress with the prefix stripped from the current key', async () => {
	const seen: Array<string> = [];
	const remote = testFs({
		control: {
			list: async (key, reporter) => {
				await reporter({ completed: 1, current: `${key}note.md`, total: 1 });
				return [];
			},
		},
		uid: 'remote',
	});
	const shim = prefixWrapper(remote.fs, '/base');

	await shim.list('/', (progress) => {
		seen.push(progress.current);
		return 'include';
	});

	expect(seen).toStrictEqual(['note.md']);
});
