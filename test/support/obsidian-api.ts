// oxlint-disable typescript/require-await typescript/no-extraneous-class no-useless-constructor no-empty-function class-methods-use-this
export async function requestUrl() {
	return {
		headers: {},
		status: 200,
		text: '',
	};
}

export const Platform = {
	isAndroidApp: false,
	isDesktop: true,
	isMobile: false,
};

export function normalizePath(path: string) {
	return path.replaceAll('\\', '/').replaceAll(/\/+/gu, '/');
}

export class Notice {
	constructor(_message: string) {}
	hide() {}
	setMessage() {
		return this;
	}
}

export class Vault {}
export class TFolder {}
export class TFile {}
// Enough of Plugin, Modal and PluginSettingTab for the built bundle's onload to run
// (test/bundle-load.test.ts); unit tests only need the classes to exist.
export class Plugin {
	manifest = { id: 'drive-bridge', version: 'test' };
	constructor(readonly app: unknown) {}
	addCommand(command: unknown) {
		return command;
	}
	addRibbonIcon() {
		return stubElement();
	}
	addStatusBarItem() {
		return stubElement();
	}
	addSettingTab() {}
	registerEvent() {}
	registerDomEvent() {}
	registerInterval(id: number) {
		return id;
	}
	register() {}
	async loadData() {
		return {};
	}
	async saveData() {}
}
export class App {}
export class Modal {
	contentEl = stubElement();
	titleEl = stubElement();
	modalEl = stubElement();
	constructor(readonly app: unknown) {}
	open() {}
	close() {}
	setTitle() {
		return this;
	}
}
export class ItemView {}
export class Setting {}
export class PluginSettingTab {
	constructor(
		readonly app: unknown,
		readonly plugin: unknown,
	) {}
	update() {}
	refreshDomState() {}
}
export class TextComponent {}
export class ButtonComponent {}
export class ProgressBarComponent {}
export class SecretComponent {}

/** A stand-in DOM element: any property is callable and returns another stand-in. */
export function stubElement(): never {
	const target = () => {};
	return new Proxy(target, {
		apply: () => stubElement(),
		get: (_target, key) => (key === 'then' ? undefined : stubElement()),
	}) as never;
}

// Real Obsidian replaces the element's content with an inline <svg>; some source code reads
// that back (e.g. to style it), so this stub does the same instead of doing nothing.
export function setIcon(el: { empty?: () => void; createSvg?: (tag: string) => unknown }) {
	el.empty?.();
	el.createSvg?.('svg');
}
export function setTooltip() {}
export function getLanguage() {
	return 'en';
}
export function requireApiVersion() {
	return true;
}

export const apiVersion = '1.12.7';

// Records the text written into a fragment; enough for code that builds plain text.
function createFragment(build?: (fragment: object) => void) {
	const parts: Array<string> = [];
	const fragment = {
		appendText: (text: string) => void parts.push(text),
		createEl: (_tag: string, options?: { text?: string }) =>
			void parts.push(options?.text ?? ''),
		createSpan: (options?: { text?: string }) => void parts.push(options?.text ?? ''),
		get textContent() {
			return parts.join('');
		},
	};
	build?.(fragment);
	return fragment;
}

Object.assign(globalThis, {
	createFragment,
	sleep: (milliseconds: number) =>
		new Promise<void>((resolve) => {
			setTimeout(resolve, milliseconds);
		}),
});
