import { mock } from 'bun:test';
import ObsidianMock from '@/shared/obsidian-mock';

Object.assign(globalThis, { window: globalThis });
void mock.module('obsidian', () => ObsidianMock);
