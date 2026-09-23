// oxlint-disable no-console
// `bun ver <x.y.z>` prepares a release: manifest.json, package.json, versions.json and
// the CHANGELOG heading. `bun ver --check [tag]` checks that they agree, and with a tag,
// that the tag matches. Nothing is committed, tagged or pushed.

import { $ } from 'bun';

const VERSION = /^(?<core>\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?$/u;

export type Manifest = { version: string; minAppVersion: string };
export type Versions = Record<string, string>;
export type ReleaseFiles = {
	manifest: Manifest;
	pkg: { version: string };
	versions: Versions;
	changelog: string;
};

export function parseVersion(version: string) {
	const core = VERSION.exec(version)?.groups?.core;
	return core ? core.split('.').map(Number) : undefined;
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. */
export function compareVersions(a: string, b: string) {
	const [left, right] = [parseVersion(a), parseVersion(b)];
	if (!left || !right) throw new Error(`Not a version: ${left ? b : a}`);
	for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
	return 0;
}

const heading = (version: string) => `## v${version}`;

/** The text under `## v<version>`, or undefined when there is no such heading. */
export function changelogSection(changelog: string, version: string) {
	const lines = changelog.split('\n');
	const start = lines.findIndex(
		(line) => line === heading(version) || line.startsWith(`${heading(version)} `),
	);
	if (start === -1) return;
	const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
	return lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim();
}

/** Adds `## v<version> - <date>` above the newest entry. */
export function addChangelogHeading(changelog: string, version: string, date: string) {
	const lines = changelog.split('\n');
	const first = lines.findIndex((line) => line.startsWith('## '));
	const at = first === -1 ? lines.length : first;
	lines.splice(at, 0, `${heading(version)} - ${date}`, '', '');
	return lines.join('\n');
}

export type BumpResult =
	| { status: 'bumped'; files: ReleaseFiles }
	| { status: 'needsNotes'; files: ReleaseFiles }
	| { status: 'invalid'; reason: string };

/**
 * Plans the release files for `next`. A changelog without a section for it gets an empty
 * heading and `needsNotes`, so the notes are written before anything else changes.
 */
export function bump(files: ReleaseFiles, next: string, date: string): BumpResult {
	if (!parseVersion(next)) return { reason: `Not a version: ${next}`, status: 'invalid' };
	if (compareVersions(next, files.manifest.version) <= 0)
		return {
			reason: `${next} is not newer than ${files.manifest.version}`,
			status: 'invalid',
		};
	const section = changelogSection(files.changelog, next);
	if (section === undefined)
		return {
			files: { ...files, changelog: addChangelogHeading(files.changelog, next, date) },
			status: 'needsNotes',
		};
	if (!section) return { files, status: 'needsNotes' };
	return {
		files: {
			changelog: files.changelog,
			manifest: { ...files.manifest, version: next },
			pkg: { ...files.pkg, version: next },
			versions: { ...files.versions, [next]: files.manifest.minAppVersion },
		},
		status: 'bumped',
	};
}

/** Problems that would make a release inconsistent; empty when everything agrees. */
export function check(files: ReleaseFiles, tag?: string) {
	const { manifest, pkg, versions, changelog } = files;
	const problems: Array<string> = [];
	if (pkg.version !== manifest.version)
		problems.push(`package.json is ${pkg.version}, manifest.json is ${manifest.version}.`);
	if (versions[manifest.version] !== manifest.minAppVersion)
		problems.push(
			`versions.json maps ${manifest.version} to ${versions[manifest.version] ?? 'nothing'}, manifest.json says minAppVersion ${manifest.minAppVersion}.`,
		);
	if (!changelogSection(changelog, manifest.version))
		problems.push(`CHANGELOG.md has no notes for v${manifest.version}.`);
	if (tag !== undefined && tag.split('-')[0] !== manifest.version)
		problems.push(`Tag ${tag} does not match manifest version ${manifest.version}.`);
	return problems;
}

const json = (value: unknown) => `${JSON.stringify(value, undefined, '\t')}\n`;

async function readFiles(): Promise<ReleaseFiles> {
	return {
		changelog: await Bun.file('CHANGELOG.md').text(),
		manifest: (await Bun.file('manifest.json').json()) as Manifest,
		pkg: (await Bun.file('package.json').json()) as { version: string },
		versions: (await Bun.file('versions.json').json()) as Versions,
	};
}

async function writeFiles(files: ReleaseFiles) {
	await Bun.write('CHANGELOG.md', files.changelog);
	await Bun.write('manifest.json', json(files.manifest));
	await Bun.write('package.json', json(files.pkg));
	await Bun.write('versions.json', json(files.versions));
}

async function main(args: Array<string>) {
	const files = await readFiles();

	if (args[0] === '--check') {
		const problems = check(files, args[1]);
		for (const problem of problems) console.error(problem);
		if (problems.length) process.exit(1);
		console.log(`Release files agree on ${files.manifest.version}.`);
		return;
	}

	const [next] = args;
	if (!next) {
		console.error('Usage: bun ver <x.y.z> | bun ver --check [tag]');
		process.exit(1);
	}
	// Only the changelog may have edits in progress; everything else must be committed.
	const dirty = (await $`git status --porcelain`.text())
		.split('\n')
		.filter((line) => line && !line.endsWith(' CHANGELOG.md'));
	if (dirty.length) {
		console.error(`Commit or stash these first:\n${dirty.join('\n')}`);
		process.exit(1);
	}

	const result = bump(files, next, new Date().toISOString().slice(0, 10));
	if (result.status === 'invalid') {
		console.error(result.reason);
		process.exit(1);
	}
	await writeFiles(result.files);
	if (result.status === 'needsNotes') {
		console.error(
			`Write the notes under "## v${next}" in CHANGELOG.md, then run bun ver ${next} again.`,
		);
		process.exit(1);
	}
	console.log(`Prepared ${next}. Review, then:\n`);
	console.log('  git add CHANGELOG.md manifest.json package.json versions.json');
	console.log(`  git commit -m "Release ${next}"`);
	console.log(`  git push origin main && git tag ${next} && git push origin ${next}`);
}

if (import.meta.main) await main(Bun.argv.slice(2));
