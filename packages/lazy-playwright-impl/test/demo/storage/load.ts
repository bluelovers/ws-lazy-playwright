/// <reference types="node" />

import { console } from 'debug-color2';
// @ts-ignore
import { EnumAutomationEngine } from '#/lib/engine';
// @ts-ignore
import { createBrowserAutomation } from '#/lib/index';
// @ts-ignore
import { EnumLogLabel } from '#/lib/logger';
// @ts-ignore
import { __TEST_TEMP_STORAGE } from '#/test/__root';

const STORAGE_ID = 'demo';

/**
 * 示範：讀取已儲存的 Cookie 與 Session（僅讀取，不建立瀏覽器）
 *
 * 先執行 `save.ts` 產生儲存檔；未存在時 `load` 回傳 `undefined`，可據此判斷尚未儲存過。
 */
export async function loadDemo()
{
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: __TEST_TEMP_STORAGE },
		},
	});

	try
	{
		console.log(EnumLogLabel.Temp, 'available cookie ids:', await automation.storage.cookies.list());
		console.log(EnumLogLabel.Temp, 'available session ids:', await automation.storage.sessions.list());

		/** 讀取 Cookie：回傳 Cookie 陣列，未儲存過為 undefined */
		const cookies = await automation.storage.cookies.load(STORAGE_ID);

		if (!cookies)
		{
			console.log(EnumLogLabel.Temp, `no cookie storage for "${STORAGE_ID}", run save.ts first`);
		}
		else
		{
			console.log(EnumLogLabel.Temp, 'cookies:', cookies.length);
			for (const cookie of cookies)
			{
				console.log(EnumLogLabel.Temp, `  - ${cookie.domain}${cookie.path} ${cookie.name}`);
			}
		}

		/** 讀取 Session：回傳 storageState 結構（cookies + origins），未儲存過為 undefined */
		const session = await automation.storage.sessions.load(STORAGE_ID);

		if (!session)
		{
			console.log(EnumLogLabel.Temp, `no session storage for "${STORAGE_ID}", run save.ts first`);
		}
		else
		{
			const localOrigins = (session.origins ?? []).filter(origin => origin.localStorage?.length);

			console.log(EnumLogLabel.Temp, 'session cookies:', session.cookies?.length ?? 0);
			console.log(EnumLogLabel.Temp, 'session origins with localStorage:',
				localOrigins.map(origin => `${origin.origin} (${origin.localStorage!.length})`));
		}
	}
	finally
	{
		// await automation.close();
	}
}

loadDemo().catch(console.error);
