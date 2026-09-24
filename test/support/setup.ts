import installDom from '$/support/dom';
import ObsidianMock from '$/support/obsidian-mock';
import { mock } from 'bun:test';

installDom();
Object.assign(globalThis, { window: globalThis });
void mock.module('obsidian', () => ObsidianMock);
