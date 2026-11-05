/// <reference types="node" />

import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from '#/lib/index';
import { EnumLogLabel } from '#/lib/logger';
import { __TEST_TEMP_STORAGE } from '#/test/__root';
import { Page } from 'playwright';

const STORAGE_ID = 'default';

/**
 * 示範：讀取已儲存的 Cookie 與 Session，還原到新的 context
 */
export async function restoreDemo()
{
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: __TEST_TEMP_STORAGE },
		},
	});

	try
	{
		/** 此時尚未有 context，監聽會在 context 建立後自動接線 */
		automation.pageLiveOn(null, (newPage) =>
		{
			console.log(EnumLogLabel.Temp, 'restored context new page:', newPage.url());
		});

		const context = await automation.newContext();

		const applied = await automation.storage.cookies.apply(STORAGE_ID, context);
		const restored = await automation.storage.sessions.restore(STORAGE_ID, context);

		console.log(EnumLogLabel.Temp, 'cookies applied:', applied);
		console.log(EnumLogLabel.Temp, 'session restored:', restored);

		let page: Page;

		page = await automation.newPage();
		await page.goto(automation.bridge.fakeApiBase);

		page = await context.newPage();
		await page.goto('https://civitai.red/posts/create');
		console.log(EnumLogLabel.Temp, 'title:', await page.title());
	}
	finally
	{
		// await automation.close();
	}
}

restoreDemo().catch(console.error);
