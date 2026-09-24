// oxlint-disable no-console
// Prints a markdown summary of coverage/lcov.info (written by `bun coverage`) and fails
// when the totals drop below the floor. Totals are weighted by lines and functions,
// unlike the average of file percentages that Bun prints. Bun's own coverageThreshold checks every file
// separately, which would fail on any single untested file.

export const FLOOR = { functions: 0.99, lines: 0.99 };

export type FileCoverage = {
	file: string;
	functions: { found: number; hit: number };
	lines: { found: number; hit: number };
};

export function parseLcov(lcov: string): Array<FileCoverage> {
	const files: Array<FileCoverage> = [];
	let current: FileCoverage | undefined;
	for (const line of lcov.split('\n')) {
		const [key, value = ''] = line.split(':');
		if (key === 'SF')
			current = { file: value, functions: { found: 0, hit: 0 }, lines: { found: 0, hit: 0 } };
		else if (!current) continue;
		else if (key === 'FNF') current.functions.found = Number(value);
		else if (key === 'FNH') current.functions.hit = Number(value);
		else if (key === 'LF') current.lines.found = Number(value);
		else if (key === 'LH') current.lines.hit = Number(value);
		else if (key === 'end_of_record') {
			files.push(current);
			current = undefined;
		}
	}
	return files;
}

const ratio = ({ found, hit }: { found: number; hit: number }) => (found ? hit / found : 1);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function totals(files: Array<FileCoverage>) {
	const sum = (pick: (file: FileCoverage) => { found: number; hit: number }) => {
		const total = { found: 0, hit: 0 };
		for (const file of files) {
			total.found += pick(file).found;
			total.hit += pick(file).hit;
		}
		return total;
	};
	return {
		functions: ratio(sum((file) => file.functions)),
		lines: ratio(sum((file) => file.lines)),
	};
}

export function summary(files: Array<FileCoverage>, floor = FLOOR) {
	const total = totals(files);
	const least = files
		.filter((file) => file.lines.found)
		.toSorted((a, b) => ratio(a.lines) - ratio(b.lines))
		.slice(0, 10);
	const failures = (['functions', 'lines'] as const)
		.filter((kind) => total[kind] < floor[kind])
		.map(
			(kind) => `${kind} ${percent(total[kind])} is below the ${percent(floor[kind])} floor`,
		);
	const text = [
		'## Test coverage',
		'',
		`Functions **${percent(total.functions)}** · Lines **${percent(total.lines)}** (floor ${percent(floor.functions)} / ${percent(floor.lines)}, files the tests load).`,
		'',
		'| Least covered | Lines | Functions |',
		'| --- | --- | --- |',
		...least.map(
			(file) =>
				`| \`${file.file}\` | ${percent(ratio(file.lines))} | ${percent(ratio(file.functions))} |`,
		),
		...(failures.length ? ['', ...failures.map((failure) => `**Failed:** ${failure}.`)] : []),
	].join('\n');
	return { failures, text };
}

if (import.meta.main) {
	const { failures, text } = summary(parseLcov(await Bun.file('coverage/lcov.info').text()));
	console.log(text);
	if (failures.length) process.exit(1);
}
