// oxlint-disable import/no-nodejs-modules no-alert no-console
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const vault = (process.argv[2] ?? prompt('Enter the Vault name to operate on: ')).trim();
if (!vault) {
	console.error('No vault provided.');
	process.exit(1);
}

const smallFileCount = 1880;
const mediumFileCount = 100;
const largeFileCount = 20;

const folderLevels = [
	[
		'Daily Notes',
		'Projects',
		'Areas',
		'Resources',
		'Work',
		'Personal',
		'Ideas',
		'Reference',
		'Archive',
	],
	['2024', '2025', '2026', 'Current', 'Backlog', 'Reference', 'Inbox'],
	['Inbox', 'Ideas', 'Weekly', 'Monthly', 'Research', 'Notes', 'Planning', 'Tasks'],
	['Q1', 'Q2', 'Q3', 'Q4', 'Design', 'Engineering'],
	['Active', 'Archived', 'Drafts', 'Review'],
	['Personal', 'Technical', 'Client', 'Internal'],
];

function filePath(kind: string, index: number) {
	const depth = (index + kind.length) % (folderLevels.length + 1);
	const folders = Array.from({ length: depth }, (_, level) => {
		const choices = folderLevels[level];
		return choices[(index * 7919 + kind.length * 104_729 + level * 97) % choices.length];
	});
	const number = String(index + 1).padStart(4, '0');
	return `${folders.length > 0 ? `${folders.join('/')}/` : ''}${kind}-${number}.md`;
}

function fileSize(index: number, minimum: number, maximum: number) {
	return minimum + ((index * 7919) % (maximum - minimum + 1));
}

type VaultFile = { path: string; size: number };

const files: Array<VaultFile> = [
	...Array.from({ length: smallFileCount }, (_, index) => ({
		path: filePath('small', index),
		size: fileSize(index, 50, 50 * 1024),
	})),
	...Array.from({ length: mediumFileCount }, (_, index) => ({
		path: filePath('medium', index),
		size: fileSize(index, 500 * 1024, 2 * 1024 * 1024),
	})),
	...Array.from({ length: largeFileCount }, (_, index) => ({
		path: filePath('large', index),
		size: fileSize(index, 15 * 1024 * 1024, 100 * 1024 * 1024),
	})),
];

const vaultProcess = Bun.spawn(['obsidian', `vault=${vault}`, 'vault', 'info=path']);
const vaultPath = (await new Response(vaultProcess.stdout).text()).trim();
if ((await vaultProcess.exited) !== 0 || vaultPath.length === 0)
	throw new Error('Unable to obtain active Obsidian vault path');

const rootEntries = await readdir(vaultPath, { withFileTypes: true });
await Promise.all(
	rootEntries
		.filter((entry) => !entry.name.startsWith('.'))
		.map((entry) => rm(join(vaultPath, entry.name), { force: true, recursive: true })),
);

const directories = new Set(
	files.flatMap(({ path }) => {
		const separator = path.lastIndexOf('/');
		return separator === -1 ? [] : [path.slice(0, separator)];
	}),
);
await Promise.all(
	[...directories].map((directory) => mkdir(`${vaultPath}/${directory}`, { recursive: true })),
);

const chunkSize = 1024 * 1024;
const contentChunk = new Uint8Array(chunkSize).fill(48);

// Keep large-file writes sequential to cap resident payload memory.
for (const file of files) {
	const writer = Bun.file(`${vaultPath}/${file.path}`).writer({ highWaterMark: chunkSize });
	let remaining = file.size;
	while (remaining > 0) {
		const chunk = contentChunk.subarray(0, Math.min(remaining, chunkSize));
		await writer.write(chunk);
		await writer.flush();
		remaining -= chunk.byteLength;
	}
	await writer.end();
}
