// Small real-DOM stand-ins for Obsidian's Modal and Setting, for testing what a modal
// renders and what its buttons do. Backed by the jsdom environment from setup.ts.

type Handler = (value?: unknown) => unknown;

export type ButtonSpy = {
	buttonEl: HTMLButtonElement;
	text: string;
	click: () => Promise<unknown>;
};

export const notices: Array<string> = [];
export function NoticeSpy(message: string) {
	notices.push(message);
}

export class ModalSpy {
	contentEl = document.createElement('div');
	title = '';
	closed = false;
	constructor(readonly app: unknown) {}
	setTitle(title: string) {
		this.title = title;
		return this;
	}
	open() {
		(this as unknown as { onOpen?: () => void }).onOpen?.();
	}
	close() {
		this.closed = true;
		(this as unknown as { onClose?: () => void }).onClose?.();
	}
}

export const settings: Array<SettingSpy> = [];

export class SettingSpy {
	settingEl = document.createElement('div');
	name = '';
	buttons: Array<ButtonSpy> = [];
	inputs: Array<{ inputEl: HTMLInputElement; change: (value: string) => unknown }> = [];
	toggles: Array<(value: boolean) => unknown> = [];
	constructor(containerEl: HTMLElement) {
		containerEl.append(this.settingEl);
		settings.push(this);
	}
	setName(name: string) {
		this.name = name;
		return this;
	}
	setDesc() {
		return this;
	}
	addToggle(cb: (toggle: unknown) => void) {
		let onChange: Handler = () => {};
		const toggle = {
			onChange: (fn: Handler) => {
				onChange = fn;
				return toggle;
			},
			setValue: () => toggle,
		};
		cb(toggle);
		this.toggles.push((value) => onChange(value));
		return this;
	}
	addText(cb: (text: unknown) => void) {
		let onChange: Handler = () => {};
		const inputEl = document.createElement('input');
		const text = {
			inputEl,
			onChange: (fn: Handler) => {
				onChange = fn;
				return text;
			},
		};
		cb(text);
		this.inputs.push({ change: (value) => onChange(value), inputEl });
		return this;
	}
	addButton(cb: (button: unknown) => void) {
		let onClick: Handler = () => {};
		const spy: ButtonSpy = {
			buttonEl: document.createElement('button'),
			click: () => Promise.resolve(onClick()),
			text: '',
		};
		const component = {
			buttonEl: spy.buttonEl,
			onClick: (fn: Handler) => {
				onClick = fn;
				return component;
			},
			setButtonText: (text: string) => {
				spy.text = text;
				return component;
			},
			setCta: () => component,
			setDestructive: () => component,
		};
		cb(component);
		this.buttons.push(spy);
		return this;
	}
}

/** The button with this text, across every setting row made so far. */
export function button(text: string): ButtonSpy {
	const found = settings.flatMap((row) => row.buttons).find((spy) => spy.text === text);
	if (!found) throw new Error(`No button ${text}`);
	return found;
}

export function resetSpies() {
	notices.length = 0;
	settings.length = 0;
}
