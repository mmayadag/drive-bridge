import type { Ref } from 'synthkernel';

export default function untilTrue(ref: Ref<boolean>, stop?: 'stop') {
	if (ref()) return;
	return new Promise<void>((resolve) => {
		const unsub = ref.subscribe((isTrue) => {
			if (!isTrue) return;
			unsub();
			resolve();
			return stop;
		});
	});
}
