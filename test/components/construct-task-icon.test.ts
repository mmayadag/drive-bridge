import { expect, test } from 'bun:test';
import type { TaskNames } from '@/sync';
import constructTaskIcon from '@/components/construct-task-icon';

// The stroke colours say which way a task goes; the icon stub draws plain svgs.
const strokes = (name: TaskNames, isDir = false) =>
	[...constructTaskIcon(document.createElement('div'), name, isDir).querySelectorAll('svg')].map(
		(svg) => svg.getAttribute('stroke'),
	);

test('moves and record tasks get an icon with a direction badge', () => {
	expect(strokes('moveLocal', true)).toStrictEqual(['currentColor', 'var(--color-green)']);
	expect(strokes('moveRemote')).toStrictEqual(['currentColor', 'var(--color-blue)']);
	expect(strokes('addRecord')).toStrictEqual(['currentColor', 'var(--color-blue)']);
	expect(strokes('resolveConflict')).toStrictEqual(['var(--color-yellow)']);
});
