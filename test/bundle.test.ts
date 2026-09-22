// The shape Obsidian loads: dist/main.js must hand back a Plugin subclass. A build that
// Changes format or drops the default export passes every other test and then fails to load.

import ObsidianMock from '$/support/obsidian-mock';
import { expect, mock, test } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);

const BUNDLE = '../dist/main.js';
const built = await Bun.file(new URL(BUNDLE, import.meta.url)).exists();

type Bundle = { default: { default: (new () => object) & { prototype: object } } };

test.skipIf(!built)('the built bundle exports a plugin class', async () => {
	const bundle = (await import(BUNDLE)) as Bundle;
	const PluginClass = bundle.default.default;

	expect(typeof PluginClass).toBe('function');
	expect(Object.getPrototypeOf(PluginClass)).toBe(ObsidianMock.Plugin);
	const members = Object.getOwnPropertyNames(PluginClass.prototype);
	expect(members).toContain('onload');
	expect(members).toContain('onunload');
});
