// oxlint-disable no-console no-alert import/no-nodejs-modules
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const vault = prompt('Enter the Vault name to operate on: ');
if (!vault) {
	console.error('No vault provided.');
	process.exit(1);
}

const vaultProcess = Bun.spawn(['obsidian', `vault=${vault}`, 'vault', 'info=path']);
const vaultPath = (await new Response(vaultProcess.stdout).text()).trim();
if ((await vaultProcess.exited) !== 0 || vaultPath.length === 0)
	throw new Error('Unable to obtain active Obsidian vault path');

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

function filePath(kind: string, index: number): string {
	const depth = (index + kind.length) % (folderLevels.length + 1);
	const folders = Array.from({ length: depth }, (_, level) => {
		const choices = folderLevels[level];
		return choices[(index * 7919 + kind.length * 104_729 + level * 97) % choices.length];
	});
	const number = String(index + 1).padStart(4, '0');
	return `${folders.length > 0 ? `${folders.join('/')}/` : ''}${kind}-${number}.md`;
}

function fileSize(index: number, minimum: number, maximum: number): number {
	return minimum + ((index * 7919) % (maximum - minimum + 1));
}

const fileMap = new Map<string, number>([
	...Array.from(
		{ length: 1880 },
		(_, i) => [filePath('small', i), fileSize(i, 50, 50 * 1024)] as const,
	),
	...Array.from(
		{ length: 100 },
		(_, i) => [filePath('medium', i), fileSize(i, 500 * 1024, 2 * 1024 * 1024)] as const,
	),
	...Array.from(
		{ length: 20 },
		(_, i) => [filePath('large', i), fileSize(i, 15 * 1024 * 1024, 100 * 1024 * 1024)] as const,
	),
]);

const sizeExpected = new Map<string, number>();

function applyCreate(path: string, size: number) {
	fileMap.set(path, size);
	sizeExpected.set(path, size);
}

function applyAppend(path: string, bytes: number) {
	const current = fileMap.get(path);
	if (current === undefined) throw new Error(`Append to unknown file: ${path}`);
	const newSize = current + bytes;
	fileMap.set(path, newSize);
	sizeExpected.set(path, newSize);
}

function applyDelete(path: string) {
	fileMap.delete(path);
	sizeExpected.delete(path);
}

function applyDeleteDir(dir: string) {
	for (const path of fileMap.keys())
		if (path === dir || path.startsWith(`${dir}/`)) {
			fileMap.delete(path);
			sizeExpected.delete(path);
		}
}

function applyMoveFile(from: string, to: string) {
	const size = fileMap.get(from);
	if (size === undefined) throw new Error(`Move of unknown file: ${from}`);
	fileMap.delete(from);
	fileMap.set(to, size);
	const expectedSize = sizeExpected.get(from);
	if (expectedSize !== undefined) {
		sizeExpected.set(to, expectedSize);
		sizeExpected.delete(from);
	}
}

function applyMoveDir(from: string, to: string) {
	for (const [path, size] of fileMap.entries())
		if (path.startsWith(`${from}/`)) {
			const newPath = to + path.slice(from.length);
			fileMap.delete(path);
			fileMap.set(newPath, size);
			const expectedSize = sizeExpected.get(path);
			if (expectedSize !== undefined) {
				sizeExpected.set(newPath, expectedSize);
				sizeExpected.delete(path);
			}
		}
}

applyCreate('Daily Notes/2026/2026-08-05.md', 1024);
applyAppend('small-1039.md', 256);
applyAppend('Daily Notes/medium-0031.md', 512);
applyAppend('Areas/small-0060.md', 192);
applyAppend('Archive/2024/Ideas/Q3/small-0063.md', 384);
applyDelete('Resources/Current/small-0131.md');
applyDeleteDir('Areas/Backlog');
applyCreate('Projects/Current/roadmap-review.md', 768);
applyCreate('Projects/Current/standup.md', 320);
applyMoveFile('small-1109.md', 'Projects/Current/small-1109.md');
applyMoveFile('small-0143.md', 'Daily Notes/2026/small-0143.md');
applyMoveFile('small-0794.md', 'Archive/2024/Monthly/small-0794.md');
applyMoveDir('Ideas', 'Inspirations');
applyMoveDir('Reference/Current', 'Reference/Active');
applyDeleteDir('Projects');
applyDelete('small-1361.md');
applyDelete('small-0108.md');
applyMoveFile('Reference/Active/large-0019.md', 'Archive/2026/large-0019.md');
applyAppend('medium-0065.md', 640);
applyAppend('small-0808.md', 224);
applyAppend('small-0248.md', 160);

const expectedDirs = new Set<string>();
for (const path of fileMap.keys()) {
	const parts = path.split('/');
	for (let i = 1; i < parts.length; i++) expectedDirs.add(parts.slice(0, i).join('/'));
}
expectedDirs.add('Work/Food');

const actualFiles = new Map<string, number>();
const actualDirs = new Set<string>();

async function scan(dir: string, relBase: string) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			actualDirs.add(rel);
			await scan(abs, rel);
		} else if (entry.isFile()) {
			const s = await stat(abs);
			actualFiles.set(rel, s.size);
		}
	}
}

await scan(vaultPath, '');

const errors: Array<string> = [];

for (const path of fileMap.keys()) if (!actualFiles.has(path)) errors.push(`Missing file: ${path}`);

for (const path of actualFiles.keys()) if (!fileMap.has(path)) errors.push(`Extra file: ${path}`);

for (const [path, expected] of sizeExpected.entries()) {
	const actual = actualFiles.get(path);
	if (actual !== undefined && actual !== expected)
		errors.push(`Wrong size: ${path} (expected ${expected}, got ${actual})`);
}

for (const dir of expectedDirs) if (!actualDirs.has(dir)) errors.push(`Missing directory: ${dir}`);

for (const dir of actualDirs) if (!expectedDirs.has(dir)) errors.push(`Extra directory: ${dir}`);

if (errors.length === 0) console.log('Validation passed: 0 errors');
else {
	console.log(`Validation failed: ${errors.length} error(s)`);
	for (const error of errors) console.log(`  ${error}`);
}
