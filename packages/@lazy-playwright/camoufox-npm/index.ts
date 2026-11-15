
import { firefox } from 'playwright-core';
import { Camoufox, NewBrowserOptions, NewContext, NewContextOptions } from 'camoufox';
import type { BrowserContextOptions, BrowserContext, Browser, LaunchOptions } from 'playwright';
import type { ITSAnyOfUnion } from 'ts-type';
/** 型別來源對齊 playwright-core@1.64，與下方版本相容性約束一致 */
import type { Browser as I_Browser } from 'playwright-core';

/** 可建立 context 的瀏覽器 (Browser) 輸入：涵蓋各相容版本來源的 Browser 實例 */
export type ICamoufoxBrowserInput = Browser | Awaited<ReturnType<typeof Camoufox>> | I_Browser;

/** Camoufox 啟動選項：Camoufox 專屬 NewBrowserOptions 或 Playwright 的 LaunchOptions */
export type ICamoufoxNewBrowserOptionsInput = ITSAnyOfUnion<NewBrowserOptions | Omit<LaunchOptions, 'headless'>>;
/** Context 建立選項：Camoufox 專屬 NewContextOptions 或 Playwright 的 BrowserContextOptions */
export type ICamoufoxNewContextOptionsInput = ITSAnyOfUnion<NewContextOptions | BrowserContextOptions>;

/**
 * 啟動 Camoufox 瀏覽器並回傳 Playwright {@link Browser}
 *
 * 版本相容性約束：camoufox 不相容 1.65 以上版本，需使用 1.64 以下版本
 * 例如
 * - playwright-core@1.64.1 (實測相容版本)
 * - playwright-core@1.62.0 (官方宣稱相容版本)
 *
 * 使用 1.65 版本會遇到以下不相容警告而無法啟動
 * `Found property "<root>.downloadOptions.legacyInterceptor" - false which is not described in this scheme`
 * 如果發現以上錯誤訊息，
 * 解決方法之一是確保專案內沒有安裝 `playwright-core` 或明確指定 `playwright-core` 的相容版本
 *
 * 另外目前推薦使用 `camoufox` (官方發布版本) 而不是 `camoufox-js` (非官方發布版本)
 *
 * @param options - Camoufox 啟動選項
 * @returns 可供 Playwright API 操作的 Browser 實例
 * @see https://www.npmjs.com/package/camoufox
 * @see https://www.npmjs.com/package/camoufox-js
 */
export async function newCamoufox(options?: ICamoufoxNewBrowserOptionsInput): Promise<Browser>
{
	// const browser = await firefox.launch(options) as any;
	const browser = await Camoufox(options);

	/**
	 * camoufox 回傳的實例與宣告的 {@link Browser} 來自不同 playwright-core 版本，
	 * 型別結構不一致，需強制轉型 (Type Assertion) 後才能以 Playwright API 操作
	 */
	return browser as any;
}

/**
 * 建立 Camoufox 瀏覽器的 BrowserContext (瀏覽上下文)
 *
 * @param browser - {@link ICamoufoxBrowserInput}，通常為 {@link newCamoufox} 建立的 Browser 實例
 * @param options - {@link ICamoufoxNewContextOptionsInput}，Camoufox 專屬或 Playwright 的 context 選項
 * @returns 可供 Playwright API 操作的 BrowserContext 實例
 */
export async function newCamoufoxContext(browser: ICamoufoxBrowserInput, options?: ICamoufoxNewContextOptionsInput)
{
	return NewContext(browser as any, options) as any as BrowserContext;
}

export default newCamoufox;
