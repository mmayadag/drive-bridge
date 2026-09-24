// The upload helpers' failure paths: a rejected session, a session with no location header,
// a failed single-shot upload, and a stream error mid-resumable-upload (which cancels the
// session on Drive).

import testKit from '$/support/test-kit';
import { expect, test } from 'bun:test';
import { guessMimeType, resumableUpload, singleUpload } from '@/gdrive/upload';

const { bytes, request } = testKit;

function response(value: unknown = {}, status = 200, headers: Record<string, string> = {}) {
	const body = new TextEncoder().encode(JSON.stringify(value));
	return {
		bytes: () => body,
		headers,
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
		text: () => new TextDecoder().decode(body),
	};
}

test('guessMimeType falls back to octet-stream for unknown or missing extensions', () => {
	expect(guessMimeType('note.md')).toBe('text/markdown');
	expect(guessMimeType('archive.zip')).toBe('application/octet-stream');
	expect(guessMimeType('no-extension')).toBe('application/octet-stream');
});

test('singleUpload throws with the parsed Drive error on failure', () => {
	const harness = request(() => response({ error: { code: 403, message: 'Forbidden' } }, 403));

	expect(
		singleUpload(
			{
				metadata: { name: 'note.md' },
				method: 'POST',
				mimeType: 'text/markdown',
				request: harness.request,
				url: 'https://upload.example.com/files',
			} as never,
			bytes('hello'),
		),
	).rejects.toThrow('Forbidden');
});

test('a session request that fails throws with the parsed error', () => {
	const harness = request(() => response({ error: { code: 500, message: 'boom' } }, 500));

	expect(
		resumableUpload(
			{
				metadata: { name: 'note.md' },
				method: 'POST',
				request: harness.request,
				size: 5,
				url: 'https://upload.example.com/files',
			} as never,
			new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
		),
	).rejects.toThrow('boom');
});

test('a session with no location header throws', () => {
	const harness = request(() => response({}, 200));

	expect(
		resumableUpload(
			{
				metadata: {},
				method: 'POST',
				request: harness.request,
				size: 5,
				url: 'https://upload.example.com/files',
			} as never,
			new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
		),
	).rejects.toThrow('did not return an upload session URL');
});

test('a stream error cancels the resumable session and rethrows', async () => {
	// The cancel itself failing is swallowed: the stream error is what the caller sees.
	const cancelled: Array<string> = [];
	const streamError = new Error('read failed');
	const harness = request((url, params) => {
		if (params.method === 'DELETE') {
			cancelled.push(url);
			throw new Error('session already gone');
		}
		return response({}, 200, { location: 'https://upload.example.com/session/1' });
	});

	expect(
		resumableUpload(
			{
				metadata: {},
				method: 'POST',
				request: harness.request,
				size: 5,
				url: 'https://upload.example.com/files',
			} as never,
			new ReadableStream({
				start(controller) {
					controller.error(streamError);
				},
			}),
		),
	).rejects.toThrow('read failed');

	await Promise.resolve();
	await Promise.resolve();
	expect(cancelled).toStrictEqual(['https://upload.example.com/session/1']);
});
