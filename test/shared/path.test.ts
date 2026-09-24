import { expect, test } from 'bun:test';
import {
	normalizeChar,
	normalizeBaseDir,
	normalizeKey,
	normalizeUrl,
	stripEndSlash,
	basename,
	dirname,
	encodeUrl,
} from '@/shared/path';

test('normalizes path characters', () => {
	expect(normalizeChar('/base/%E2%82%AC.md')).toBe('/base/€.md');
	expect(normalizeChar('/base/e\u0301.md')).toBe('/base/é.md');
});

test('normalizes keys with dir suffix', () => {
	expect(normalizeKey('/base//folder/note.md', false)).toBe('base/folder/note.md');
	expect(normalizeKey('/base//folder/', true)).toBe('base/folder/');
});

test('normalizes base dir', () => {
	expect(normalizeBaseDir('/base/%E2%82%AC')).toBe('base/€/');
	expect(normalizeBaseDir('/')).toBe('/');
});

test('returns dirname for keys', () => {
	expect(dirname('/')).toBe('/');
	expect(dirname('folder/note.md')).toBe('folder/');
	expect(dirname('folder/')).toBe('/');
});

test('returns basename for keys', () => {
	expect(basename('/')).toBe('');
	expect(basename('folder/note.md')).toBe('note.md');
	expect(basename('folder/')).toBe('folder');
});

test('normalizes urls', () => {
	expect(normalizeUrl('https://example.com/base/')).toBe('https://example.com/base');
	expect(() => normalizeUrl('ftp://example.com')).toThrow('Invalid URL ftp://example.com');
});

test('strips trailing slash', () => {
	expect(stripEndSlash('folder/')).toBe('folder');
	expect(stripEndSlash('folder')).toBe('folder');
});

test('percent-encodes each path segment without touching the slashes', () => {
	expect(encodeUrl("folder/a note (draft)'s.md")).toBe('folder/a%20note%20%28draft%29%27s.md');
	expect(encodeUrl('folder/')).toBe('folder/');
	expect(encodeUrl('/leading')).toBe('/leading');
});
