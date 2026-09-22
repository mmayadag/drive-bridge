import { mock } from 'bun:test';
import ObsidianMock from '@/shared/obsidian-mock';

Object.assign(globalThis, { window: globalThis });
process.env.CLIENT_ID = btoa(process.env.GDRIVE_CLIENT_ID ?? '');
process.env.CLIENT_SECRET = btoa(process.env.GDRIVE_CLIENT_SECRET ?? '');
void mock.module('obsidian', () => ObsidianMock);
