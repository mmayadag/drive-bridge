<script lang="ts" setup>
import type { JSONCanvas } from '@json-canvas-viewer/vue';
import {
	JSONCanvasViewerComponent as Viewer,
	Minimap,
	MistouchPreventer,
	Controls,
} from '@json-canvas-viewer/vue';
import { useData } from 'vitepress';

const { isDark } = useData();
const isPrerendering = Boolean(import.meta.env.SSR);
const { canvas } = defineProps<{ canvas: JSONCanvas }>();
</script>

<template>
	<Suspense>
		<Viewer
			:options="{
				loading: 'lazy',
				minimapCollapsed: true,
				preventMistouchAtStart: true,
			}"
			class="canvas-viewer"
			:modules="[Minimap, MistouchPreventer, Controls]"
			:theme="isDark ? 'dark' : 'light'"
			:canvas
			:isPrerendering
		/>
	</Suspense>
</template>
