/**
 * `gotoPage` 的 `newPageMaybe` 與 `checkMatch` 耦合測試：
 *
 * - 同網址略過導航時 `shouldNewPage` 不生效，需另開分頁的覆寫
 *   必須連同 `shouldGoto = true` 一併給出
 * - 異網址依 `newPageMaybe` 另開新頁時，舊頁保留原網址且不被關閉
 */
import { test, expect } from '@playwright/test';
import { gotoPage } from '../lib/goto-util';

/** 建立貼文頁 URL（data URL 預先 percent-encode，導航前後字串一致） */
const CREATE_URL = 'data:text/html,%3Ch1%3Ecreate%3C%2Fh1%3E';

/** 落地頁 URL：代表已離開建立貼文頁、停留在原地的舊分頁 */
const LANDING_URL = 'data:text/html,%3Ch1%3Elanding%3C%2Fh1%3E';

test.describe('gotoPage: newPageMaybe 與 checkMatch 耦合', () =>
{
	/** 與 createPostPage 同形的導航選項：同網址略過、可依條件開新頁 */
	const baseOptions = {
		ensurePage: true,
		newPageMaybe: true,
		checkMatch: { href: true },
	};

	test('同網址 + checkMatch.href：略過導航，重用現有分頁', async ({ page, context }) =>
	{
		await page.goto(CREATE_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, baseOptions, { context, page });

		expect(result).toMatchObject({
			isSameUrl: true,
			shouldGoto: false,
			didGoto: false,
		});
		expect(result.page).toBe(page);
		expect(context.pages()).toHaveLength(before);
		await expect(page).toHaveURL(CREATE_URL);
	});

	test('異網址：依 newPageMaybe 導航並另開新頁，舊頁保留原網址', async ({ page, context }) =>
	{
		await page.goto(LANDING_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, baseOptions, { context, page });

		expect(result).toMatchObject({
			isSameUrl: false,
			shouldGoto: true,
			didGoto: true,
		});
		expect(result.page).not.toBe(page);
		expect(context.pages()).toHaveLength(before + 1);
		await expect(page).toHaveURL(LANDING_URL);
		await expect(result.page).toHaveURL(CREATE_URL);
	});

	test('同網址 + callback 僅覆寫 shouldNewPage：不導航亦不開新頁', async ({ page, context }) =>
	{
		await page.goto(CREATE_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, {
			...baseOptions,
			checkMatch: {
				href: true,
				callback: (result) =>
				{
					result.shouldNewPage = true;
					return result;
				},
			},
		}, { context, page });

		/** 未連同覆寫 `shouldGoto`：同網址維持略過導航，`shouldNewPage` 不被採用 */
		expect(result).toMatchObject({
			shouldGoto: false,
			didGoto: false,
		});
		expect(result.page).toBe(page);
		expect(context.pages()).toHaveLength(before);
	});

	test('同網址 + callback 連同覆寫 shouldGoto：保留原頁並另開新頁導航', async ({ page, context }) =>
	{
		await page.goto(CREATE_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, {
			...baseOptions,
			checkMatch: {
				href: true,
				callback: (result) =>
				{
					/** 模擬殘留檔案：原頁保留，覆寫兩欄位強制另開新頁 */
					result.shouldGoto = true;
					result.shouldNewPage = true;
					return result;
				},
			},
		}, { context, page });

		expect(result).toMatchObject({
			shouldGoto: true,
			didGoto: true,
		});
		expect(result.page).not.toBe(page);
		expect(context.pages()).toHaveLength(before + 1);
		await expect(page).toHaveURL(CREATE_URL);
		await expect(result.page).toHaveURL(CREATE_URL);
	});

	test('同網址 + callback 覆寫 shouldNewPage=false：重用現有空白頁', async ({ page, context }) =>
	{
		await page.goto(CREATE_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, {
			...baseOptions,
			checkMatch: {
				href: true,
				callback: (result) =>
				{
					result.shouldNewPage = false;
					return result;
				},
			},
		}, { context, page });

		expect(result).toMatchObject({
			didGoto: false,
		});
		expect(result.page).toBe(page);
		expect(context.pages()).toHaveLength(before);
		await expect(page).toHaveURL(CREATE_URL);
	});

	test('newPage: true：即使同網址也強制另開新頁', async ({ page, context }) =>
	{
		await page.goto(CREATE_URL);

		const before = context.pages().length;

		const result = await gotoPage(page, CREATE_URL, { newPage: true }, { context, page });

		expect(result).toMatchObject({
			didGoto: true,
			isNewPage: true,
		});
		expect(result.page).not.toBe(page);
		expect(context.pages()).toHaveLength(before + 1);
		await expect(page).toHaveURL(CREATE_URL);
	});
});
