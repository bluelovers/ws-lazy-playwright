/// <reference types="node" />
/**
 * `goto-util` 單元測試（無瀏覽器）：
 * 鎖定 `checkMatch` / `newPageMaybe` 判定、`callback` 覆寫耦合
 * 與 `gotoPage` 的分頁來源邊界
 */
import { test } from 'node:test';
import type { BrowserContext, Page } from 'playwright';
import {
	_checkShouldGotoUrl,
	_handleGotoOptionsCheckMatch,
	_handleGotoOptionsInput,
	gotoPage,
} from '../lib/goto-util';

/** 假分頁：僅提供 `gotoPage` 判定與導航所需的最小行為；`navigated` 記錄導航目標 */
function _createFakePage(url: string)
{
	const navigated: string[] = [];

	const page = {
		isClosed: () => false,
		url: () => url,
		goto: async (target: string) =>
		{
			navigated.push(target);
		},
	} as unknown as Page;

	return { page, navigated };
}

/** 假 context：僅提供新分頁建立所需的 `context.newPage` 與主分頁 */
function _createFakeCtx(newPage: () => Promise<Page>, mainPage: Page)
{
	return {
		page: mainPage,
		context: { newPage } as unknown as BrowserContext,
	};
}

test('checkMatch 布林輸入正規化為 href 物件', (t: test.TestContext) =>
{
	t.assert.deepStrictEqual(_handleGotoOptionsCheckMatch(true), { href: true });
	t.assert.deepStrictEqual(_handleGotoOptionsCheckMatch(false), { href: false });
	/** 未提供時包為 `{ href: undefined }`（falsy，與 false 同效） */
	t.assert.deepStrictEqual(_handleGotoOptionsCheckMatch(undefined), { href: undefined });
	t.assert.deepStrictEqual(_handleGotoOptionsCheckMatch(null), {});
});

test('referer 布林輸入正規化：true 沿用目前網址、false 移除、其餘原樣', (t: test.TestContext) =>
{
	const runtime = { currentPageUrl: 'https://current/' };

	t.assert.deepStrictEqual(
		_handleGotoOptionsInput(runtime, { referer: true }),
		{ referer: 'https://current/' },
	);
	t.assert.deepStrictEqual(
		_handleGotoOptionsInput(runtime, { referer: false }),
		{},
	);
	t.assert.deepStrictEqual(
		_handleGotoOptionsInput(runtime, { waitUntil: 'commit' }),
		{ waitUntil: 'commit' },
	);
});

test('異網址：newPageMaybe 提議開新頁且應導航', async (t: test.TestContext) =>
{
	const result = await _checkShouldGotoUrl(
		'https://target/',
		'https://current/',
		{ href: true },
		{ newPageMaybe: true },
	);

	t.assert.deepStrictEqual(result, {
		isSameUrl: false,
		shouldGoto: true,
		shouldNewPage: true,
	});
});

test('同網址 + href：略過導航，newPageMaybe 不提議開新頁', async (t: test.TestContext) =>
{
	const result = await _checkShouldGotoUrl(
		'https://same/',
		'https://same/',
		{ href: true },
		{ newPageMaybe: true },
	);

	t.assert.deepStrictEqual(result, {
		isSameUrl: true,
		shouldGoto: false,
		shouldNewPage: undefined,
	});
});

test('同網址 + callback 僅覆寫 shouldNewPage：維持略過導航', async (t: test.TestContext) =>
{
	const result = await _checkShouldGotoUrl('https://same/', 'https://same/', {
		href: true,
		callback: (result) =>
		{
			result.shouldNewPage = true;
			return result;
		},
	}, { newPageMaybe: true });

	t.assert.deepStrictEqual(result, {
		isSameUrl: true,
		shouldGoto: false,
		shouldNewPage: true,
	});
});

test('同網址 + callback 連同覆寫 shouldGoto：改為導航並開新頁', async (t: test.TestContext) =>
{
	const result = await _checkShouldGotoUrl('https://same/', 'https://same/', {
		href: true,
		callback: (result) =>
		{
			result.shouldGoto = true;
			result.shouldNewPage = true;
			return result;
		},
	}, { newPageMaybe: true });

	t.assert.deepStrictEqual(result, {
		isSameUrl: true,
		shouldGoto: true,
		shouldNewPage: true,
	});
});

test('newPage: true：同網址仍提議開新頁', async (t: test.TestContext) =>
{
	const result = await _checkShouldGotoUrl(
		'https://same/',
		'https://same/',
		{ href: true },
		{ newPage: true },
	);

	t.assert.deepStrictEqual(result, {
		isSameUrl: true,
		shouldGoto: false,
		shouldNewPage: true,
	});
});

test('gotoPage 同網址略過導航：不觸發 goto、回傳原分頁', async (t: test.TestContext) =>
{
	const fake = _createFakePage('https://same/');

	const result = await gotoPage(fake.page, 'https://same/', { checkMatch: { href: true } });

	t.assert.deepStrictEqual(
		{
			didGoto: result.didGoto,
			isNewPage: result.isNewPage,
			page: result.page,
			navigated: fake.navigated,
		},
		{
			didGoto: false,
			isNewPage: undefined,
			page: fake.page,
			navigated: [],
		},
	);
});

test('gotoPage 異網址：依 newPageMaybe 開新頁導航，舊頁不動', async (t: test.TestContext) =>
{
	const old = _createFakePage('https://old/');
	const fresh = _createFakePage('about:blank');
	const ctx = _createFakeCtx(async () => fresh.page, old.page);

	const result = await gotoPage(old.page, 'https://target/', { newPageMaybe: true }, ctx);

	t.assert.deepStrictEqual(
		{
			didGoto: result.didGoto,
			isNewPage: result.isNewPage,
			page: result.page,
			navigated: fresh.navigated,
		},
		{
			didGoto: true,
			isNewPage: true,
			page: fresh.page,
			navigated: ['https://target/'],
		},
	);
	t.assert.deepStrictEqual(old.navigated, []);
});

test('gotoPage ensurePage 且分頁已關閉：以 context 建立新分頁導航', async (t: test.TestContext) =>
{
	const closed = { isClosed: () => true } as unknown as Page;
	const fresh = _createFakePage('about:blank');
	const ctx = _createFakeCtx(async () => fresh.page, fresh.page);

	const result = await gotoPage(closed, 'https://target/', { ensurePage: true }, ctx);

	t.assert.deepStrictEqual(
		{
			didGoto: result.didGoto,
			isNewPage: result.isNewPage,
			page: result.page,
			navigated: fresh.navigated,
		},
		{
			didGoto: true,
			isNewPage: true,
			page: fresh.page,
			navigated: ['https://target/'],
		},
	);
});

test('gotoPage 需新分頁但無 context：拋出錯誤', async (t: test.TestContext) =>
{
	const closed = { isClosed: () => true } as unknown as Page;

	await t.assert.rejects(
		() => gotoPage(closed, 'https://target/', { ensurePage: true }),
		/Cannot create new page without browser context/,
	);
});
