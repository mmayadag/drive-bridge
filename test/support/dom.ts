// A minimal, from-scratch re-implementation of the DOM helper methods Obsidian adds on top
// of the standard DOM (createDiv, addClass, setText, show/hide, ...), layered onto jsdom.
// Obsidian ships only type declarations for these, not a runtime, so this exists purely to
// let settings-rendering code run in tests without a real Obsidian window. It is not meant
// to be a faithful reimplementation, only enough for what this plugin's own code calls.

import { JSDOM } from 'jsdom';

type DomElementInfo = {
	cls?: string | Array<string>;
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	parent?: Node & ParentNode;
	value?: string;
	type?: string;
	prepend?: boolean;
	placeholder?: string;
	href?: string;
};

function applyClass(el: Element, cls: string | Array<string> | undefined) {
	if (!cls) return;
	for (const name of Array.isArray(cls) ? cls : cls.split(' ')) if (name) el.classList.add(name);
}

function applyDomElementInfo(el: HTMLElement, info?: DomElementInfo | string) {
	if (info === undefined) return el;
	// Obsidian's shorthand: a bare string is the CSS class, not text content.
	if (typeof info === 'string') {
		applyClass(el, info);
		return el;
	}
	applyClass(el, info.cls);
	if (info.text !== undefined) el.textContent = info.text;
	if (info.title) el.setAttribute('title', info.title);
	if (info.attr) for (const [key, value] of Object.entries(info.attr)) el.setAttr(key, value);
	if (info.value !== undefined) (el as unknown as { value: string }).value = info.value;
	if (info.type !== undefined) el.setAttribute('type', info.type);
	if (info.placeholder !== undefined) el.setAttribute('placeholder', info.placeholder);
	if (info.href !== undefined) el.setAttribute('href', info.href);
	if (info.prepend) info.parent?.insertBefore(el, info.parent.firstChild);
	else info.parent?.append(el);
	return el;
}

let installed = false;

/** Installs jsdom plus Obsidian's DOM extensions as globals. Safe to call more than once. */
export default function installDom() {
	if (installed) return;
	installed = true;

	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	const { window } = dom;

	// `window` is deliberately left as `globalThis` (set in setup.ts): plenty of source and
	// test code mocks `window.setTimeout`/`window.open`/etc. by assigning onto `globalThis`,
	// which only works when the two are the same object. jsdom's Window is used here purely
	// as an element/document factory, never installed as the global `window`.
	Object.assign(globalThis, {
		Comment: window.Comment,
		Document: window.Document,
		DocumentFragment: window.DocumentFragment,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		// Not `Event` itself: fake-indexeddb's own EventTarget expects the native `Event` that
		// was already global, and jsdom elements accept these two regardless of what
		// `globalThis.Event` is, since dispatch is checked against their own window.
		KeyboardEvent: window.KeyboardEvent,
		MouseEvent: window.MouseEvent,
		Node: window.Node,
		Text: window.Text,
		activeDocument: window.document,
		createDiv: (o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void) =>
			globalCreateEl('div', o, callback),
		createEl: globalCreateEl,
		createFragment: (build?: (fragment: DocumentFragment) => void) => {
			const fragment = window.document.createDocumentFragment();
			build?.(fragment);
			return fragment;
		},
		createSpan: (o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void) =>
			globalCreateEl('span', o, callback),
		createSvg: (
			tag: string,
			o?: DomElementInfo | string,
			callback?: (el: SVGElement) => void,
		) => {
			const el = window.document.createElementNS('http://www.w3.org/2000/svg', tag);
			applyDomElementInfo(el as unknown as HTMLElement, o);
			callback?.(el);
			return el;
		},
		document: window.document,
		getComputedStyle: window.getComputedStyle.bind(window),
	});

	function globalCreateEl<K extends keyof HTMLElementTagNameMap>(
		tag: K,
		o?: DomElementInfo | string,
		callback?: (el: HTMLElementTagNameMap[K]) => void,
	): HTMLElementTagNameMap[K] {
		const el = window.document.createElement(tag);
		applyDomElementInfo(el, o);
		callback?.(el);
		return el;
	}

	const nodeProto = window.Node.prototype as unknown as Record<string, unknown>;
	Object.assign(nodeProto, {
		appendText(this: Node & ParentNode, text: string) {
			this.append(window.document.createTextNode(text));
		},
		createDiv(
			this: Node & ParentNode,
			o?: DomElementInfo | string,
			callback?: (el: HTMLDivElement) => void,
		) {
			return appendChild(this, globalCreateEl('div', o, callback));
		},
		createEl<K extends keyof HTMLElementTagNameMap>(
			this: Node & ParentNode,
			tag: K,
			o?: DomElementInfo | string,
			callback?: (el: HTMLElementTagNameMap[K]) => void,
		) {
			return appendChild(this, globalCreateEl(tag, o, callback));
		},
		createSpan(
			this: Node & ParentNode,
			o?: DomElementInfo | string,
			callback?: (el: HTMLSpanElement) => void,
		) {
			return appendChild(this, globalCreateEl('span', o, callback));
		},
		createSvg(
			this: Node & ParentNode,
			tag: string,
			o?: DomElementInfo | string,
			callback?: (el: SVGElement) => void,
		) {
			const el = window.document.createElementNS('http://www.w3.org/2000/svg', tag);
			applyDomElementInfo(el as unknown as HTMLElement, o);
			callback?.(el);
			return appendChild(this, el as unknown as Element);
		},
		detach(this: ChildNode) {
			this.remove();
		},
		empty(this: Element) {
			while (this.firstChild) this.firstChild.remove();
		},
	});

	const elProto = window.Element.prototype as unknown as Record<string, unknown>;
	Object.assign(elProto, {
		addClass(this: Element, ...classes: Array<string>) {
			this.classList.add(...classes);
		},
		addClasses(this: Element, classes: Array<string>) {
			this.classList.add(...classes);
		},
		find(this: Element, selector: string) {
			return this.querySelector(selector);
		},
		findAll(this: Element, selector: string) {
			return [...this.querySelectorAll(selector)];
		},
		getAttr(this: Element, name: string) {
			return this.getAttribute(name);
		},
		getText(this: Element) {
			return this.textContent ?? '';
		},
		hasClass(this: Element, cls: string) {
			return this.classList.contains(cls);
		},
		removeClass(this: Element, ...classes: Array<string>) {
			this.classList.remove(...classes);
		},
		removeClasses(this: Element, classes: Array<string>) {
			this.classList.remove(...classes);
		},
		setAttr(this: Element, name: string, value: string | number | boolean | null) {
			if (value === null || value === false) this.removeAttribute(name);
			else this.setAttribute(name, String(value));
		},
		setAttrs(this: Element, attrs: Record<string, string | number | boolean | null>) {
			for (const [name, value] of Object.entries(attrs))
				(this as unknown as { setAttr: (n: string, v: unknown) => void }).setAttr(
					name,
					value,
				);
		},
		setText(this: Element, value: string) {
			this.textContent = value;
		},
		toggleClass(this: Element, classes: string | Array<string>, value: boolean) {
			for (const name of Array.isArray(classes) ? classes : [classes])
				this.classList.toggle(name, value);
		},
	});

	function appendChild<T extends Element>(parent: Node & ParentNode, child: T): T {
		parent.append(child);
		return child;
	}

	const htmlProto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
	Object.assign(htmlProto, {
		hide(this: HTMLElement) {
			this.style.display = 'none';
		},
		isShown(this: HTMLElement) {
			return this.style.display !== 'none';
		},
		show(this: HTMLElement) {
			this.style.display = '';
		},
		toggle(this: HTMLElement, show: boolean) {
			this.style.display = show ? '' : 'none';
		},
	});
}
