/// <reference types="node" />
/**
 * `open-new-util` 單元測試（無瀏覽器）：
 * 鎖定 `createNewPage` 的新分頁建立與 background 前景還原契約
 */
import { test } from 'node:test';
import type { BrowserContext, Page } from 'playwright';
import { createNewPage } from '../lib/open-new-util';

/** 主分頁替身：記錄 `bringToFront` 呼叫 */
function _createMainPage(calls: string[])
{
	return {
		bringToFront: async () =>
		{
			calls.push('bringToFront');
		},
	} as unknown as Page;
}

/** 提供 `context.newPage` 與主分頁的假 ctx */
function _createFakeCtx(newPage: () => Promise<Page>, mainPage: Page)
{
	return {
		page: mainPage,
		context: { newPage } as unknown as BrowserContext,
	};
}

test('預設：回傳 context 建立的新分頁，不切換前景', async (t: test.TestContext) =>
{
	const calls: string[] = [];
	const main = _createMainPage(calls);
	const fresh = {} as Page;
	const ctx = _createFakeCtx(async () => fresh, main);

	const result = await createNewPage(ctx);

	t.assert.deepStrictEqual({ page: result, calls }, { page: fresh, calls: [] });
});

test('background 且新頁非主分頁：主分頁拉回前景', async (t: test.TestContext) =>
{
	const calls: string[] = [];
	const main = _createMainPage(calls);
	const fresh = {} as Page;
	const ctx = _createFakeCtx(async () => fresh, main);

	const result = await createNewPage(ctx, { background: true, waitForBringToFront: true });

	t.assert.deepStrictEqual({ page: result, calls }, { page: fresh, calls: ['bringToFront'] });
});

test('background 但新頁即主分頁：不切換前景', async (t: test.TestContext) =>
{
	const calls: string[] = [];
	const main = _createMainPage(calls);
	const ctx = _createFakeCtx(async () => main, main);

	const result = await createNewPage(ctx, { background: true, waitForBringToFront: true });

	t.assert.deepStrictEqual({ page: result, calls }, { page: main, calls: [] });
});
