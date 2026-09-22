import ObsidianMock from '$/support/obsidian-mock';
import { mock } from 'bun:test';

Object.assign(globalThis, { window: globalThis });
void mock.module('obsidian', () => ObsidianMock);
