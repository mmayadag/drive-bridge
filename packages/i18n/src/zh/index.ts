import type {
	SelectFromContext,
	ObsidianLanguageCode,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import zh from './translations';

// oxlint-disable-next-line typescript/no-extraneous-class
export default class I18nZh {
	constructor(
		ctx: SelectFromContext<{
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		ctx.registerI18n('zh', zh);
	}
}
