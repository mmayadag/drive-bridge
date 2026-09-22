import type { Fs } from './interface';

/** Unwraps every wrapper around a file system and returns the innermost one. */
export default function digOriginal(wrapped: Fs) {
	let original = wrapped;
	while ('original' in original) original = original.original;
	return original;
}
