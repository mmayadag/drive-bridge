// oxlint-disable no-console
// Fails when AI tool or bot attribution, or a watermark, would reach the repository.
// Human co-authors are fine. Run by CI on every PR, on pushes to main and before a release:
//   bun scripts/check-attribution.ts pr           # env BASE_SHA, HEAD_SHA, PR_TITLE, PR_BODY
//   bun scripts/check-attribution.ts push         # env BEFORE, AFTER
//   bun scripts/check-attribution.ts commit <rev>
//   bun scripts/check-attribution.ts range <a..b>  # locally, before opening a PR

import { $ } from 'bun';

// Tool, vendor and bot names, only ever matched inside a co-author trailer, where an
// ordinary word like "cursor" cannot be prose.
const TOOL_NAMES =
	/\b(?:claude|anthropic|codex|openai|chatgpt|gpt|copilot|gemini|cursor|devin|aider|windsurf|tabnine|codeium|cody)\b|\[bot\]|@anthropic\.com|@openai\.com/iu;
// Names that have no ordinary meaning in this project, so any mention in a commit message
// or a PR title or description counts.
const NAMES_IN_TEXT = /\b(?:claude|anthropic|codex|openai|chatgpt|copilot|gemini|gpt-?\d)\b/iu;
// Watermark shapes, checked everywhere, added diff lines included.
const WATERMARKS: Array<RegExp> = [
	/^\s*co-authored-by:.*(?:\b(?:claude|anthropic|codex|openai|chatgpt|gpt|copilot|gemini|cursor|devin|aider|windsurf|tabnine|codeium|cody)\b|\[bot\]|@anthropic\.com|@openai\.com)/iu,
	/\bgenerated (?:with|by)\b.{0,40}\b(?:claude|codex|chatgpt|copilot|gemini|cursor|ai)\b/iu,
	/^\s*[a-z-]*session:\s*https?:\/\//iu,
	/claude\.ai\/code|chatgpt\.com\/codex/iu,
	/\u{1F916}/u,
];
const CO_AUTHOR = /^\s*co-authored-by:\s*(?<who>.+)$/iu;

/** The lines of a commit message or PR text that carry attribution. */
export function messageFindings(text: string): Array<string> {
	return text.split('\n').filter((line) => {
		const who = CO_AUTHOR.exec(line)?.groups?.who;
		if (who !== undefined) return TOOL_NAMES.test(who);
		return NAMES_IN_TEXT.test(line) || WATERMARKS.some((pattern) => pattern.test(line));
	});
}

/** Added diff lines that carry a watermark; plain words in files are left alone. */
export function diffFindings(lines: Array<string>): Array<string> {
	return lines.filter((line) => WATERMARKS.some((pattern) => pattern.test(line)));
}

// This script and its test hold the patterns themselves.
const OWN_FILES = [':!scripts/check-attribution.ts', ':!test/scripts/check-attribution.test.ts'];
const ZERO_SHA = /^0+$/u;

async function commitMessages(revisions: Array<string>): Promise<Array<[string, string]>> {
	const out = await $`git log --format=%H%x00%B%x1e ${revisions}`.text();
	return out
		.split('\u001E')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [sha, message = ''] = entry.split('\u0000');
			return [sha.slice(0, 7), message];
		});
}

async function addedLines(range: string): Promise<Array<string>> {
	const diff = await $`git diff --unified=0 ${range} -- . ${OWN_FILES}`.text();
	return diff
		.split('\n')
		.filter((line) => line.startsWith('+') && !line.startsWith('+++'))
		.map((line) => line.slice(1));
}

async function reachable(sha: string) {
	return (await $`git cat-file -e ${sha}^{commit}`.nothrow().quiet()).exitCode === 0;
}

async function main(args: Array<string>) {
	const [mode, value] = args;
	const env = process.env;
	const problems: Array<string> = [];
	const checkCommits = async (...revisions: Array<string>) => {
		for (const [sha, message] of await commitMessages(revisions))
			for (const line of messageFindings(message)) problems.push(`commit ${sha}: ${line}`);
	};

	if (mode === 'pr') {
		const range = `${env.BASE_SHA}..${env.HEAD_SHA}`;
		await checkCommits(range);
		for (const [field, text] of [
			['PR title', env.PR_TITLE ?? ''],
			['PR description', env.PR_BODY ?? ''],
		] as const)
			for (const line of messageFindings(text)) problems.push(`${field}: ${line}`);
		for (const line of diffFindings(await addedLines(`${env.BASE_SHA}...${env.HEAD_SHA}`)))
			problems.push(`added line: ${line}`);
	} else if (mode === 'push') {
		const after = env.AFTER ?? 'HEAD';
		const before = env.BEFORE ?? '';
		// A new branch or a force-push has no usable "before": check the pushed tip alone.
		const usable = before && !ZERO_SHA.test(before) && (await reachable(before));
		await (usable ? checkCommits(`${before}..${after}`) : checkCommits('-1', after));
	} else if (mode === 'commit') await checkCommits('-1', value ?? 'HEAD');
	else if (mode === 'range' && value) await checkCommits(value);
	else {
		console.error('Usage: check-attribution.ts pr | push | commit [rev] | range <a..b>');
		process.exit(2);
	}

	if (problems.length === 0) {
		console.log('No AI tool attribution or watermark found.');
		return;
	}
	console.error('AI tool attribution or a watermark was found; remove it before merging:');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

if (import.meta.main) await main(Bun.argv.slice(2));
