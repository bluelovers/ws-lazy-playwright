import { DEFAULT_AUTOMATION_ENGINE, EnumAutomationEngine } from './engine';
import type { ICamoufoxBrowserAutomationOptions } from './camoufox-options';
import type { ICreateBrowserAutomationOptions } from './types';

export * from './engine';
export * from './types';
export * from './browser-automation';
export * from './camoufox-options';
export * from './storage';
export * from './playwright/config';
export * from './playwright/browser-util';
export * from './playwright/event';
export * from './playwright/camoufox-utils';
export * from './playwright/camoufox-prefs';

/**
 * 兩個實作類別僅以型別導出，避免靜態載入阻礙延遲 (Lazy) import
 */
export type { PlaywrightBrowserAutomation } from './playwright-impl';
export type { CamoufoxBrowserAutomation } from './camoufox-impl';

/**
 * 依 `options.engine` 建立對應的自動化實作
 *
 * Playwright 與 Camoufox 的模組皆以動態 import 載入，
 * 未選用的引擎不會進入 bundle。
 */
export async function createBrowserAutomation(
	options: ICreateBrowserAutomationOptions = {},
)
{
	const engine = ((options.engine ?? DEFAULT_AUTOMATION_ENGINE) || EnumAutomationEngine.Playwright) as EnumAutomationEngine;

	switch (engine)
	{
		case EnumAutomationEngine.Playwright:
		case EnumAutomationEngine.Chromium:
		case EnumAutomationEngine.Chrome:
		{
			const { PlaywrightBrowserAutomation } = await import('./playwright-impl');
			return new PlaywrightBrowserAutomation(options) as PlaywrightBrowserAutomation;
		}
		case EnumAutomationEngine.Camoufox:
		case EnumAutomationEngine.Firefox:
		{
			const { CamoufoxBrowserAutomation } = await import('./camoufox-impl');
			return new CamoufoxBrowserAutomation(options as ICamoufoxBrowserAutomationOptions) as CamoufoxBrowserAutomation;
		}
	}

	throw new Error(`Unsupported automation engine: ${engine}`);
}
