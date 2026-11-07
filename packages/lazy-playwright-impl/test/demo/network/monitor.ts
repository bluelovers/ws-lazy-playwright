import { console } from 'debug-color2';
import { createBrowserAutomation } from '#/lib';
import { EnumLogLabel } from '#/lib/logger';
import { NetworkMonitor } from '#/lib/network/monitor';

/**
 * 示範：網路監聽 (Network Monitor)
 *
 * 註冊 request / response / navigation 三類監聽，並示範
 * 未過濾輸出、類型過濾（`json`）、glob URL 模式與主框架跳轉過濾。
 *
 * JSON 回應由 `page.route` 以本地內容攔截提供，不依賴外部服務。
 */
export async function monitorDemo()
{
	const automation = await createBrowserAutomation({});

	try
	{
		await automation.newContext();

		const page = await automation.newPage();

		/**
		 * 攔截 `demo.json` 並以本地內容回應，
		 * 讓 `type: 'json'` 的示範可穩定觸發
		 */
		await page.route('**/demo.json', route => route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ ok: true }),
		}));

		const monitor = new NetworkMonitor(page);

		/** 未過濾：列出所有請求的資源類型與網址 */
		monitor.on('request', ({ resourceType, href }) =>
		{
			console.log(EnumLogLabel.Temp, `[request] ${resourceType} ${href}`);
		});

		/** 類型過濾：僅 JSON 回應——`content-type` 要到 response 階段才可解析 */
		monitor.on('response', { type: 'json' }, ({ contentType, href }) =>
		{
			console.log(EnumLogLabel.Temp, `[json] ${contentType} ${href}`);
		});

		/** glob 過濾：比對目標為 `pathname`，故 `/docs/**` 命中 docs 路徑下的主文件 */
		monitor.on('response', { url: '/docs/**', type: 'document' }, ({ response, href }) =>
		{
			console.log(EnumLogLabel.Temp, `[document] ${response.status()} ${href}`);
		});

		/** 主框架跳轉：記錄 from -> href（首次跳轉沒有前次紀錄） */
		monitor.on('navigation', { mainFrame: true }, ({ from, href }) =>
		{
			console.log(EnumLogLabel.Temp, `[navigation] ${from ?? '(start)'} -> ${href}`);
		});

		await page.goto('https://example.com');

		/** 觸發一次 JSON fetch，回應走上面的 `page.route` */
		await page.evaluate(() => fetch('/demo.json').then(r => r.json()).catch(() => null));

		await page.goto('https://playwright.dev/docs/pages');

		monitor.dispose();
	}
	finally
	{
		await automation.close();
	}
}

monitorDemo().catch(console.error);
