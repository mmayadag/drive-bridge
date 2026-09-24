type Factory<A = undefined> = (args: A) => DocumentFragment | string;
export type Fragment<A = undefined> = (args: A) => DocumentFragment;
export type Snippet<A = undefined> = (args: A) => string;

type TranslationTypes = string | Factory<never>;
export type TranslationResource = Record<string, TranslationTypes>;

type TranslateParams<R extends TranslationTypes> =
	R extends Factory<infer A> ? ([A] extends [undefined] ? [] : [A]) : [];
export type Translate<O extends TranslationResource> = <K extends keyof O>(
	key: K,
	...arg: TranslateParams<O[K]>
) => O[K] extends string | Snippet<never> ? string : DocumentFragment;

export default class I18n {
	// One language for now. Adding more means merging another resource here and
	// choosing between them, which nothing needs yet.
	readonly i18n: TranslationResource = {};

	private readonly registerTranslations = (resource: TranslationResource) =>
		void Object.assign(this.i18n, resource);

	private readonly translate = ((key: string, arg: unknown) => {
		const value = this.i18n[key];
		if (typeof value === 'string') return value;
		// A string asked for before it is registered shows its key rather than breaking the caller.
		if (typeof value !== 'function') return key;
		return (value as Factory<unknown>)(arg);
	}) as Translate<TranslationResource>;

	root = {
		registerTranslations: this.registerTranslations,
		translate: this.translate,
	};
}
