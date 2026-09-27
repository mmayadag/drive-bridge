import type { Command } from 'obsidian';
import type { Ref } from '@/shared/reactive';
import type { Translate } from './i18n';
import type { SyncOptions, SyncTerminateReason } from './sync';

export type PreviewSyncTranslations = { previewSync: string };

type PreviewContext = {
	isIdle: Ref<boolean>;
	executeSync: (trigger: string, options?: SyncOptions) => Promise<SyncTerminateReason>;
};

/**
 * Plans a sync and shows it, changing nothing. Runs directly rather than through the
 * scheduler, which would merge it with a waiting sync. Nothing happens while one runs.
 */
export function previewSync({ isIdle, executeSync }: PreviewContext) {
	if (!isIdle()) return false;
	void executeSync('preview', { preview: true });
	return true;
}

/** The Preview sync command. */
export function registerPreviewSync(
	ctx: PreviewContext & {
		addCommand: (command: Command) => Command;
		translate: Translate<PreviewSyncTranslations>;
	},
) {
	ctx.addCommand({
		checkCallback: (checking: boolean) => {
			if (!ctx.isIdle()) return false;
			if (!checking) previewSync(ctx);
			return true;
		},
		icon: 'eye',
		id: 'preview-sync',
		name: ctx.translate('previewSync'),
	});
}
