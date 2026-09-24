import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import { cancellationWrapper } from '@/fs';
import { ref } from '@/shared/reactive';
import { syncCancelledError } from '@/sync';

const { bytes, deferred, file, flush, fs, stream } = testKit;

test('cancellation wrapper rejects read before delegation', () => {
	const harness = fs();
	const wrapper = cancellationWrapper(harness.fs, ref(true));

	expect(wrapper.read('note.md', file('note.md'))).rejects.toBe(syncCancelledError);
	expect(harness.calls.read).toStrictEqual([]);
});

test('cancellation wrapper rejects write after resolution when cancelled', async () => {
	const isCancelled = ref(false);
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { write: () => writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, isCancelled);
	const noteStat = file('note.md');

	const pending = wrapper.write('note.md', bytes('1234'), noteStat);
	await flush();
	isCancelled(true);
	writeDeferred.resolve('write-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.write).toStrictEqual([['note.md', bytes('1234'), noteStat]]);
});

test('cancellation wrapper rejects writeStream after resolution when cancelled', async () => {
	const isCancelled = ref(false);
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { writeStream: () => writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, isCancelled);
	const streamStat = file('stream.md');

	const pending = wrapper.writeStream('stream.md', stream(['1234']), streamStat);
	await flush();
	isCancelled(true);
	writeDeferred.resolve('stream-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.writeStream).toStrictEqual([['stream.md', streamStat]]);
});

test('every operation delegates through when never cancelled', async () => {
	const harness = fs();
	const wrapper = cancellationWrapper(harness.fs, ref(false));
	const stat = file('note.md');

	expect(wrapper.getUid()).toBe('uid');
	await wrapper.read('note.md', stat);
	await wrapper.readStream('note.md', stat);
	await wrapper.delete('note.md');
	await wrapper.move('old.md', 'new.md');
	await wrapper.mkdir('folder/', true);
	await wrapper.stat('note.md');
	await wrapper.exists('note.md');
	await wrapper.list('/', () => 'include');

	expect(harness.calls.read).toStrictEqual([['note.md', stat]]);
	expect(harness.calls.readStream).toStrictEqual([['note.md', stat]]);
	expect(harness.calls.delete).toStrictEqual(['note.md']);
	expect(harness.calls.move).toStrictEqual([['old.md', 'new.md']]);
	expect(harness.calls.mkdir).toStrictEqual(['folder/']);
	expect(harness.calls.stat).toStrictEqual(['note.md']);
	expect(harness.calls.exists).toStrictEqual(['note.md']);
	expect(harness.calls.list).toStrictEqual(['/']);
});

test('a "both"-guarded operation also rejects before delegation when already cancelled', () => {
	const harness = fs();
	const wrapper = cancellationWrapper(harness.fs, ref(true));

	expect(wrapper.delete('note.md')).rejects.toBe(syncCancelledError);
	expect(harness.calls.delete).toStrictEqual([]);
});
