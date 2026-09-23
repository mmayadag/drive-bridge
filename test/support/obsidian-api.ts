// oxlint-disable typescript/require-await typescript/no-extraneous-class no-useless-constructor no-empty-function
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
}

export class Vault {}
export class TFolder {}
export class TFile {}
export class Plugin {}
export class App {}
export class Modal {}
export class Setting {}
export class PluginSettingTab {}
export class TextComponent {}
export class ButtonComponent {}
export class ProgressBarComponent {}
export class SecretComponent {}

export function setIcon() {}
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
