
import { Camoufox, NewBrowserOptions } from 'camoufox';
import type { Browser } from 'playwright';
import { firefox } from 'playwright-core';

/**
 * 此處回傳的雖然是 {@link Browser}
 * 但實際上因為版本有差異
 * 所以需要強制轉型
 *
 * camoufox 不相容 1.65 以上版本，需要使用 1.64 以下版本
 * 例如
 * - playwright-core@1.64.1 (實測相容版本)
 * - playwright-core@1.62.0 (官方宣稱相容版本)
 *
 * 使用 1.65 阪本會遇到以下不相容警告而無法啟動
 * `Found property "<root>.downloadOptions.legacyInterceptor" - false which is not described in this scheme`
 * 如果發現以上錯誤訊息，
 * 解決方法之一是確保專案內沒有安裝 `playwright-core` 或明確指定 `playwright-core` 的相容版本
 *
 * 另外目前推薦使用 `camoufox` (官方發布版本) 而不是 `camoufox-js` (非官方發布版本)
 *
 * @see https://www.npmjs.com/package/camoufox
 * @see https://www.npmjs.com/package/camoufox-js
 */
export async function newCamoufox(options?: NewBrowserOptions): Promise<Browser>
{
	// const browser = await firefox.launch(options) as any;
	const browser = await Camoufox(options);

	return browser as any;
}

export default newCamoufox;
