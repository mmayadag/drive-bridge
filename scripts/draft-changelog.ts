// oxlint-disable no-console
// `bun changelog <milestone>` prints a draft CHANGELOG section from the milestone's
// closed issues, to edit before `bun ver`. Runs on the maintainer's machine through the
// GitHub CLI; the plugin itself never talks to GitHub.

import { $ } from 'bun';

export type Issue = { number: number; title: string; labels: Array<{ name: string }> };

/** One bullet per issue: fixes first, then changes, each by issue number. */
export function draftSection(milestone: string, issues: Array<Issue>, date: string) {
	const isFix = (issue: Issue) => issue.labels.some(({ name }) => name === 'bug');
	const bullets = (list: Array<Issue>) =>
		list
			.toSorted((a, b) => a.number - b.number)
			.map(({ number, title }) => `- ${title} (#${number}).`);
	const fixes = bullets(issues.filter(isFix));
	const changes = bullets(issues.filter((issue) => !isFix(issue)));
	return [
		`## v${milestone} - ${date}`,
		'',
		...changes,
		...(changes.length && fixes.length ? [''] : []),
		...(fixes.length ? ['Fixes:', '', ...fixes] : []),
	].join('\n');
}

async function closedIssues(milestone: string): Promise<Array<Issue>> {
	const milestones =
		(await $`gh api ${'repos/{owner}/{repo}/milestones?state=all&per_page=100'}`.json()) as Array<{
			number: number;
			title: string;
		}>;
	const found = milestones.find(({ title }) => title === milestone);
	if (!found) throw new Error(`No milestone named ${milestone}.`);
	const items =
		(await $`gh api --paginate ${`repos/{owner}/{repo}/issues?milestone=${found.number}&state=closed&per_page=100`}`.json()) as Array<
			Issue & { pull_request?: unknown }
		>;
	return items.filter((item) => !item.pull_request);
}

if (import.meta.main) {
	const [milestone] = Bun.argv.slice(2);
	if (!milestone) {
		console.error('Usage: bun changelog <milestone>');
		process.exit(1);
	}
	const issues = await closedIssues(milestone);
	console.log(draftSection(milestone, issues, new Date().toISOString().slice(0, 10)));
}
