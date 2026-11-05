/// <reference types="node" />

import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from '#/lib/index';
import { EnumLogLabel } from '#/lib/logger';
import { __TEST_TEMP_STORAGE } from '../../__root';

const STORAGE_ID = 'demo';

/**
 * 示範：啟動瀏覽器、擷取 Cookie 與 Session 並寫入儲存
 */
export async function saveDemo()
{
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: __TEST_TEMP_STORAGE },
		},
	});

	try
	{
		const page = await automation.newPage();

		/** 監聽保存在實例上，之後重建 context 仍會自動重新掛載 */
		automation.pageLiveOn(page, (newPage) =>
		{
			console.log(EnumLogLabel.Temp, 'new page:', newPage.url());
		});

		await page.goto('https://example.com/#saveDemo');
		console.log(EnumLogLabel.Temp, 'title:', await page.title());

		const context = automation.context;
		if (!context) throw new Error('context is not ready');

		await automation.storage.cookies.save(STORAGE_ID, context);
		await automation.storage.sessions.save(STORAGE_ID, context);

		console.log(EnumLogLabel.Temp, 'saved cookies:', await automation.storage.cookies.list());
		console.log(EnumLogLabel.Temp, 'saved sessions:', await automation.storage.sessions.list());
	}
	finally
	{
		// await automation.close();
	}
}

saveDemo().catch(console.error);
