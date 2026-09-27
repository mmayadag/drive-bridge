import type { Translate, TranslationResource } from '@/modules/i18n';
import I18n from '@/modules/i18n';

/** The real translate function over one resource, as a module sees it at runtime. */
export default function translateWith<R extends TranslationResource>(resource: R): Translate<R> {
	const i18n = new I18n();
	i18n.root.registerTranslations(resource);
	return i18n.root.translate;
}
