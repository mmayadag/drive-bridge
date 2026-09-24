import { expect, test } from 'bun:test';
import I18n from '@/modules/i18n';

test('a string asked for before it is registered gives its key instead of throwing', () => {
	const i18n = new I18n();
	const { registerTranslations } = i18n.root;
	const translate = i18n.root.translate as unknown as (key: string, arg?: string) => string;
	expect(translate('retrySkippedFiles')).toBe('retrySkippedFiles');
	registerTranslations({ greet: (name: string) => `Hi ${name}`, retrySkippedFiles: 'Retry' });
	expect(translate('retrySkippedFiles')).toBe('Retry');
	expect(translate('greet', 'you')).toBe('Hi you');
});
