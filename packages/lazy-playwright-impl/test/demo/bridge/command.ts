/// <reference types="node" />

import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from '#/lib/index';
import { EnumLogLabel } from '#/lib/logger';
import { __TEST_TEMP_STORAGE } from '#/test/__root';

/**
 * 示範：頁面通訊協議 (Page Bridge) 的 XHR 通道與內建預設指令
 */
export async function bridgeDemo()
{
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: __TEST_TEMP_STORAGE },
		},
		bridge: {
			/** 便利函式預設不註冊，此處示範自訂名稱 */
			exposeGlobal: true,
			globalName: '__m9_scrape',
		},
	});

	try
	{
		/** 任意命令皆可自行註冊；`page` 為發出請求的頁面，`ctx.page` 為主頁面 */
		automation.bridge.register('title', async (_args, page, ctx) =>
		{
			const target = page ?? ctx.page;
			return target ? await target.title() : null;
		});

		console.log(EnumLogLabel.Temp, 'registered commands:', automation.bridge.commands);

		const page = await automation.newPage();
		await page.goto('https://example.com/#bridgeDemo');

		/** 內建指令：回傳簡易且不含隱私的資訊（引擎、瀏覽器類型） */
		const echo = await page.evaluate(async () => await (window as any).__m9_scrape('echo', ['hello']));
		console.log(EnumLogLabel.Temp, 'echo:', echo);

		/** 內建指令：儲存 session 與 cookies */
		console.log(EnumLogLabel.Temp, 'saveSession:', await page.evaluate(async () => await (window as any).__m9_scrape('saveSession', ['demo'])));
		console.log(EnumLogLabel.Temp, 'saveCookies:', await page.evaluate(async () => await (window as any).__m9_scrape('saveCookies', ['demo'])));

		/** 自訂指令 */
		console.log(EnumLogLabel.Temp, 'title:', await page.evaluate(async () => await (window as any).__m9_scrape('title')));

		/** 可互動的指令控制台：直接開啟 base URL 即可選取指令執行 */
		console.log(EnumLogLabel.Temp, 'console:', automation.bridge.fakeApiBase);
		await page.goto(automation.bridge.fakeApiBase);
	}
	finally
	{
		// await automation.close();
	}
}

bridgeDemo().catch(console.error);
