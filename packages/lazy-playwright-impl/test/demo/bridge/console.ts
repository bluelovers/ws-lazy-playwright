/// <reference types="node" />

import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from '#/lib/index';
import { EnumLogLabel } from '#/lib/logger';
import { BRIDGE_CONSOLE_EVENT, BRIDGE_CONSOLE_PREFIX } from '#/lib/bridge/const';
import { __TEST_TEMP_STORAGE } from '#/test/__root';

/**
 * 示範：console 訊息通道（非侵入式聽取與注入式便利函式）
 */
export async function consoleChannelDemo()
{
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: __TEST_TEMP_STORAGE },
		},
		bridge: {
			/** 啟用 console 訊息通道：純 Node 端聽取，不注入腳本 */
			useConsole: true,
			/** 另行注入 console 通道的頁面端便利函式（需搭配 useConsole） */
			exposeConsoleGlobal: true,
		},
	});

	try
	{
		const page = await automation.newPage();
		await page.goto('https://example.com/#consoleChannelDemo');

		/** 非侵入式：直接以 console 發送命令，不需注入任何腳本 */
		const viaConsole = await page.evaluate(async ({ event, prefix }) => new Promise((resolve) =>
		{
			window.addEventListener(event, (e: any) => resolve((e as any).detail.result), { once: true });
			console.log(prefix + JSON.stringify({ id: 'demo-1', cmd: 'echo', args: ['via console'] }));
		}), { event: BRIDGE_CONSOLE_EVENT, prefix: BRIDGE_CONSOLE_PREFIX });
		console.log(EnumLogLabel.Temp, 'echo via console (non-invasive):', viaConsole);

		/** 注入式：以 `window.__m9_console` 便利函式呼叫 */
		const viaConsoleGlobal = await page.evaluate(async () => await (window as any).__m9_console('echo', ['via console']));
		console.log(EnumLogLabel.Temp, 'echo via console global:', viaConsoleGlobal);
	}
	finally
	{
		// await automation.close();
	}
}

consoleChannelDemo().catch(console.error);