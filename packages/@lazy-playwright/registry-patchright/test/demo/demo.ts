import { createBrowserAutomation } from 'lazy-playwright-impl/lib';
import { registerPatchright, PATCHRIGHT_MODULE_ID } from '../../index';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';

(async () => {
	registerPatchright();

	const automation = await createBrowserAutomation({
		// engine: EnumAutomationEngine.Camoufox,

		module: PATCHRIGHT_MODULE_ID,
		channel: "chrome",
	});

	const context = await automation.newContext();

	await automation.goto('https://www.npmjs.com/search?q=author%3Abluelovers', {
		ensurePage: true,
	});

	/**
	 * 於頁面上點選任何套件連結，即可查看是否能通過 cloudflare 檢測
	 * 目前根據測試 無法通過驗證碼 即使手動點擊也無效
	 */

})();
