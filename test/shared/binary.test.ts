import { expect, test } from 'bun:test';
import {
	concatBinary,
	textToUint8Array,
	toArrayBuffer,
	toUint8Array,
	uint8ArrayEquals,
	uint8ArrayToText,
} from '@/shared/binary';

test('toUint8Array wraps an ArrayBuffer', () => {
	const buffer = new Uint8Array([1, 2, 3]).buffer;
	expect(toUint8Array(buffer)).toStrictEqual(new Uint8Array([1, 2, 3]));
});

test('toArrayBuffer returns the underlying buffer for a whole-buffer view, a slice otherwise', () => {
	const whole = new Uint8Array([1, 2, 3]);
	expect(toArrayBuffer(whole)).toBe(whole.buffer);

	const backing = new Uint8Array([0, 1, 2, 3, 0]).buffer;
	const sliceView = new Uint8Array(backing, 1, 3);
	const sliced = toArrayBuffer(sliceView);
	expect(sliced).not.toBe(backing);
	expect(new Uint8Array(sliced)).toStrictEqual(new Uint8Array([1, 2, 3]));
});

test('uint8ArrayEquals compares by reference, length and content', () => {
	const a = new Uint8Array([1, 2, 3]);
	expect(uint8ArrayEquals(a, a)).toBe(true);
	expect(uint8ArrayEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
	expect(uint8ArrayEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
	expect(uint8ArrayEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
});

test('text round-trips through Uint8Array', () => {
	expect(uint8ArrayToText(textToUint8Array('héllo'))).toBe('héllo');
});

test('concatBinary joins Uint8Arrays and ArrayBuffers in order', () => {
	const joined = concatBinary(
		new Uint8Array([1, 2]),
		new Uint8Array([3, 4, 5]).buffer,
		new Uint8Array([6]),
	);
	expect(joined).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
});
