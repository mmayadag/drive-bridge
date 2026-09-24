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

test('computed with explicit deps recomputes only when those refs change', () => {
	const a = ref(1);
	const untracked = ref(100);
	const sum = computed(() => a() + untracked(), { deps: [a] });
	expect(sum()).toBe(101);

	untracked(200);
	expect(sum()).toBe(101); // Not a declared dep, so no recompute happened.

	a(10);
	expect(sum()).toBe(210);
});

test('computed.subscribe fires immediately when asked, and on every change otherwise', () => {
	const a = ref(1);
	const sum = computed(() => a() * 2);
	const seen: Array<[number, number]> = [];
	sum.subscribe((next, previous) => void seen.push([next, previous]), { immediate: true });
	expect(seen).toEqual([[2, 2]]);

	a(5);
	expect(seen).toEqual([
		[2, 2],
		[10, 2],
	]);
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

test('unsubscribing and clearing stop a ref from notifying', () => {
	const count = ref(0);
	const seen: Array<number> = [];
	const unsubscribe = count.subscribe((next) => void seen.push(next));
	count(1);
	unsubscribe();
	count(2);
	count.subscribe((next) => void seen.push(next));
	count.clear();
	count(3);
	expect(seen).toEqual([1]);
});

test('unsubscribing and clearing stop a computed from notifying', () => {
	const a = ref(1);
	const double = computed(() => a() * 2);
	const seen: Array<number> = [];
	const unsubscribe = double.subscribe((next) => void seen.push(next));
	a(2);
	unsubscribe();
	a(3);
	double.subscribe((next) => void seen.push(next));
	double.clear();
	a(4);
	expect(seen).toEqual([4]);
	expect(double()).toBe(8);
});

test('clearing a hook drops every subscriber', () => {
	const event = hook<[string]>();
	const received: Array<string> = [];
	event.subscribe((value) => void received.push(value));
	event.clear();
	event('a');
	expect(received).toEqual([]);
});
