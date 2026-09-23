import type { Setting, SettingDefinition } from 'obsidian';

export type Flow = 'both' | 'toRemote' | 'toLocal';

export type Choice = {
	key: string;
	name: string;
	description?: string;
	example?: string;
	flow?: Flow;
	order?: number;
};

const CHECKED = 'is-checked';

export const byOrder = (a: { order?: number }, b: { order?: number }) =>
	(a.order ?? 100) - (b.order ?? 100);

/**
 * Rows that pick one of several strategies, like radio buttons. `select` stores the
 * choice; the rows only mark it.
 */
export function choiceRows(
	choices: Array<Choice>,
	selected: () => string,
	select: (key: string) => void,
): Array<SettingDefinition> {
	const radios = new Map<string, HTMLElement>();
	const mark = () => {
		for (const [key, radio] of radios) {
			radio.toggleClass(CHECKED, key === selected());
			radio.setAttr('aria-checked', String(key === selected()));
		}
	};
	const choose = (key: string) => {
		select(key);
		mark();
	};
	return choices.toSorted(byOrder).map((choice) => ({
		desc: choice.description,
		name: choice.name,
		render: (setting: Setting) => {
			const row = setting.settingEl;
			row.addClass('drive-bridge-choice');
			const radio = createDiv({
				attr: { role: 'radio', tabindex: '0' },
				cls: 'drive-bridge-radio',
			});
			row.prepend(radio);
			radios.set(choice.key, radio);
			if (choice.flow) drawFlow(setting.descEl, choice.flow);
			if (choice.example)
				setting.descEl.createDiv({
					cls: 'drive-bridge-choice-example',
					text: choice.example,
				});
			row.addEventListener('click', () => choose(choice.key));
			radio.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				choose(choice.key);
			});
			mark();
			return () => radios.delete(choice.key);
		},
		search: false,
	}));
}

// Vault and Drive with the arrow of the direction files move in.
function drawFlow(parent: HTMLElement, flow: Flow) {
	const svg = parent.createSvg('svg', {
		attr: { 'aria-hidden': 'true', viewBox: '0 0 124 28' },
		cls: 'drive-bridge-flow',
	});
	svg.createSvg('rect', {
		attr: { height: 20, rx: 5, width: 36, x: 2, y: 4 },
		cls: 'drive-bridge-flow-vault',
	});
	svg.createSvg('text', { attr: { x: 20, y: 17.5 } }).textContent = 'Vault';
	svg.createSvg('rect', {
		attr: { height: 20, rx: 10, width: 36, x: 86, y: 4 },
		cls: 'drive-bridge-flow-drive',
	});
	svg.createSvg('text', {
		attr: { x: 104, y: 17.5 },
		cls: 'drive-bridge-flow-dark',
	}).textContent = 'Drive';
	const arrow = ['M46 14h32'];
	if (flow !== 'toLocal') arrow.push('M72 8l6 6-6 6');
	if (flow !== 'toRemote') arrow.push('M52 8l-6 6 6 6');
	svg.createSvg('path', { attr: { d: arrow.join('') }, cls: 'drive-bridge-flow-arrow' });
}
