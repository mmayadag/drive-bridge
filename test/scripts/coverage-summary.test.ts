import { expect, test } from 'bun:test';
import { parseLcov, summary, totals } from '../../scripts/coverage-summary';

const LCOV = `TN:
SF:src/a.ts
FNF:4
FNH:4
LF:100
LH:90
end_of_record
TN:
SF:src/b.ts
FNF:2
FNH:0
LF:10
LH:1
end_of_record
`;

test('reads files and adds up the totals', () => {
	const files = parseLcov(LCOV);
	expect(files.map((file) => file.file)).toStrictEqual(['src/a.ts', 'src/b.ts']);
	const total = totals(files);
	expect(total.functions).toBeCloseTo(4 / 6);
	expect(total.lines).toBeCloseTo(91 / 110);
});

test('lists the least covered files first and passes above the floor', () => {
	const { failures, text } = summary(parseLcov(LCOV), { functions: 0.5, lines: 0.8 });
	expect(failures).toStrictEqual([]);
	expect(text.indexOf('src/b.ts')).toBeLessThan(text.indexOf('src/a.ts'));
});

test('fails below the floor', () => {
	const { failures } = summary(parseLcov(LCOV), { functions: 0.9, lines: 0.8 });
	expect(failures).toStrictEqual(['functions 66.7% is below the 90.0% floor']);
});
