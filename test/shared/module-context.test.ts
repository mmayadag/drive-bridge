import { expect, test } from 'bun:test';
import { createContext } from '@/shared/module-context';

test('createContext merges module keys, flattens root and injects results', () => {
	class First {
		settings = { a: 1 };
		root = { hello: () => 'hi' };
	}
	class Second {
		settings = { b: 2 };
	}
	const context = createContext([First, Second] as const, {
		injectKeys: ['settings'],
		mergeKeys: ['settings', 'root'],
		preMerge: { app: 'app' },
	});
	expect(context.settings).toEqual({ a: 1, b: 2 });
	expect(context.hello()).toBe('hi');
	expect(context.app).toBe('app');
	expect(context.__getModule__(Second).settings).toBe(context.settings);
});

test('__addModule__ merges a late module', () => {
	class Base {
		settings = { a: 1 };
	}
	class Late {
		settings = { late: true };
	}
	const context = createContext([Base] as const, { mergeKeys: ['settings'] });
	context.__addModule__(Late as never);
	expect(context.settings as object).toEqual({ a: 1, late: true });
	expect(context.__getModule__(Base).settings).toBe(context.settings);
});
