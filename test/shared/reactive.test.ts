import { expect, test } from 'bun:test';
import { computed, hook, ref } from '@/shared/reactive';

test('ref reads, writes and notifies only on change', () => {
	const count = ref(1);
	const seen: Array<[number, number]> = [];
	count.subscribe((next, previous) => void seen.push([next, previous]));
	count(1);
	count(2);
	expect(count()).toBe(2);
	expect(seen).toEqual([[2, 1]]);
});

test('ref listener returning stop skips later listeners', () => {
	const flag = ref(false);
	const calls: Array<string> = [];
	flag.subscribe(() => {
		calls.push('first');
		return 'stop';
	});
	flag.subscribe(() => void calls.push('second'));
	flag(true);
	expect(calls).toEqual(['first']);
});

test('computed tracks refs it reads and stops after dispose', () => {
	const a = ref(1);
	const b = ref(2);
	const sum = computed(() => a() + b());
	expect(sum()).toBe(3);
	a(10);
	expect(sum()).toBe(12);
	sum.dispose();
	b(20);
	expect(sum()).toBe(12);
});

test('hook calls subscribers with arguments', () => {
	const event = hook<[string]>();
	const received: Array<string> = [];
	const unsubscribe = event.subscribe((value) => void received.push(value));
	event('a');
	unsubscribe();
	event('b');
	expect(received).toEqual(['a']);
});
