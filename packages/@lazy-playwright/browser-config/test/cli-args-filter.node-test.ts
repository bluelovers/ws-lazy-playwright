/// <reference types="node" />
import { describe, it, type TestContext } from 'node:test';
// @ts-ignore
import { inspect, isDeepStrictEqual, isPartialDeepStrictEqual } from 'node:util';

import { EnumAutomationEngine, type IBrowserKind } from '@lazy-playwright/shared-types';
import { filterCliArgsByPrefixes, registerUnsupportedCliArgs } from '../lib/util/cli-args-filter';
import { filterUnsupportedCliArgs } from '../lib/opt-cli-args-filter';
import { _assertMatchByOrderStrict } from './test-lib/assert/array';
import { _assertLazyPartialDeepStrictEqual } from './test-lib/assert/helper';

describe('filterCliArgsByPrefixes', () =>
{
	it('移除字面前綴命中的旗標，連同其獨立值 token 一併移除', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(['-width', '800'], ['-width'], EnumAutomationEngine.Chromium);

		t.assert.deepStrictEqual(actual, []);
		t.assert.snapshot(actual);
	});

	it('保留未命中的參數與相對順序', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(
			['--disable-features=Foo', '--lang=zh-TW', '--headless'],
			['--disable-features='],
			EnumAutomationEngine.Chromium,
		);

		t.assert.deepStrictEqual(actual, ['--lang=zh-TW', '--headless']);
		t.assert.snapshot(actual);
	});

	it('值以 `=` 內嵌時只移除該旗標，不影響後續 token', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(
			['--window-size=800,600', '--headless'],
			['--window-size='],
			EnumAutomationEngine.Firefox,
		);

		t.assert.deepStrictEqual(actual, ['--headless']);
		t.assert.snapshot(actual);
	});

	it('下一個 token 以 `-` 開頭時視為相鄰旗標，不連帶移除', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(['-width', '-height'], ['-width'], EnumAutomationEngine.Chromium);

		t.assert.deepStrictEqual(actual, ['-height']);
		t.assert.snapshot(actual);
	});

	it('flag 位於末尾（無值 token）時僅移除自身', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(['--headless'], ['--headless'], EnumAutomationEngine.Chromium);

		t.assert.deepStrictEqual(actual, []);
		t.assert.snapshot(actual);
	});

	it('RegExp 條件命中時連同獨立值 token 移除', (t: TestContext) =>
	{
		const actual = filterCliArgsByPrefixes(['-width', '800'], [/^-width$/], EnumAutomationEngine.Chromium);

		t.assert.deepStrictEqual(actual, []);
		t.assert.snapshot(actual);
	});

	it('含 `g` 旗標的 RegExp 重複呼叫不受 `lastIndex` 殘留影響', (t: TestContext) =>
	{
		const matcher = /^--lang=/g;
		const first = filterCliArgsByPrefixes(['--lang=zh-TW', '--headless'], [matcher], EnumAutomationEngine.Firefox);
		const second = filterCliArgsByPrefixes(['--lang=ja', '--headless'], [matcher], EnumAutomationEngine.Firefox);

		t.assert.deepStrictEqual(first, ['--headless']);
		t.assert.deepStrictEqual(second, ['--headless']);
		t.assert.snapshot({ first, second });
	});

	it('判定函式可取得 context（index / args / baseKind）', (t: TestContext) =>
	{
		const seen: Array<{ index: number; args: readonly string[]; baseKind: IBrowserKind }> = [];

		const actual = filterCliArgsByPrefixes(['--keep', '--drop'], [
			(arg, ctx) =>
			{
				if (ctx)
				{
					seen.push({ index: ctx.index, args: ctx.args, baseKind: ctx.baseKind });
				}
				return arg === '--drop';
			},
		], EnumAutomationEngine.Firefox);

		t.assert.deepStrictEqual(actual, ['--keep']);
		t.assert.deepStrictEqual(seen, [
			{ index: 0, args: ['--keep', '--drop'], baseKind: EnumAutomationEngine.Firefox },
			{ index: 1, args: ['--keep', '--drop'], baseKind: EnumAutomationEngine.Firefox },
		]);
		t.assert.snapshot({ actual, seen });
	});

	it('不支援的條件型別拋出 TypeError', (t: TestContext) =>
	{
		t.assert.throws(
			() => filterCliArgsByPrefixes(['--headless'], [123 as never], EnumAutomationEngine.Chromium),
			TypeError,
		);
	});

	it('一次性 Iterable（generator）作為條件時不會被耗盡', (t: TestContext) =>
	{
		function* matchers()
		{
			yield '-width';
		}

		const actual = filterCliArgsByPrefixes(['-width', '800', '-width', '600'], matchers(), EnumAutomationEngine.Chromium);

		t.assert.deepStrictEqual(actual, []);
		t.assert.snapshot(actual);
	});
});

describe('filterUnsupportedCliArgs', () =>
{
	it('chromium 移除 Firefox 風格的 `-width` 及其值', (t: TestContext) =>
	{
		const actual = filterUnsupportedCliArgs(EnumAutomationEngine.Chromium, [
			'--disable-features=Foo',
			'--window-size=800,600',
			'--lang=zh-TW',
			'--headless',
			'-width',
			'800',
		]);

		t.assert.deepStrictEqual(actual, [
			'--disable-features=Foo',
			'--window-size=800,600',
			'--lang=zh-TW',
			'--headless',
		]);
		t.assert.snapshot(actual);
	});

	it('firefox 移除 Chromium 風格參數，但保留 `-width` 與其值', (t: TestContext) =>
	{
		const actual = filterUnsupportedCliArgs(EnumAutomationEngine.Firefox, [
			'--disable-features=Foo',
			'--window-size=800,600',
			'--lang=zh-TW',
			'--headless',
			'-width',
			'800',
		]);

		t.assert.deepStrictEqual(actual, ['--headless', '-width', '800']);
		t.assert.snapshot(actual);

		/* === 示範其他等效斷言用法 === */

		// t.assert.partialDeepStrictEqual(actual, ['-width', '800']);
		_assertMatchByOrderStrict(t.assert, actual, ['--headless', '-width', '800']);
		_assertLazyPartialDeepStrictEqual(t.assert, actual, [
			['--headless'],
			['-width', '800'],
		]);
	});

	it('未註冊條件的瀏覽器原樣保留（回傳新陣列）', (t: TestContext) =>
	{
		const args = ['--headless', '--lang=zh-TW'];
		const actual = filterUnsupportedCliArgs(EnumAutomationEngine.Webkit, args);

		t.assert.deepStrictEqual(actual, args);
		t.assert.notStrictEqual(actual, args);
		t.assert.snapshot(actual);
	});

	it('可持續註冊新條件並生效', (t: TestContext) =>
	{
		registerUnsupportedCliArgs(EnumAutomationEngine.Webkit, ['--fake-']);

		const actual = filterUnsupportedCliArgs(EnumAutomationEngine.Webkit, ['--fake-x', '--headless']);

		t.assert.deepStrictEqual(actual, ['--headless']);
		t.assert.snapshot(actual);
	});
});
