import { DEFAULT_AUTOMATION_ENGINE, EnumAutomationEngine, _handleBrowserKind } from '@lazy-playwright/shared-types';
import type { ICamoufoxBrowserAutomationOptions } from './camoufox-options';
import type { ICreateBrowserAutomationOptions } from './types/types';

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
	const engine = options.engine ?? DEFAULT_AUTOMATION_ENGINE;
	/** 以 `_handleBrowserKind` 歸一化引擎值，再以 baseKind 分派實作類別 */
	const { baseKind } = _handleBrowserKind(engine);

	switch (baseKind)
	{
		case EnumAutomationEngine.Chromium:
		{
			const { PlaywrightBrowserAutomation } = await import('./playwright-impl');
			return new PlaywrightBrowserAutomation(options);
		}
		case EnumAutomationEngine.Firefox:
		{
			const { CamoufoxBrowserAutomation } = await import('./camoufox-impl');
			return new CamoufoxBrowserAutomation(options as ICamoufoxBrowserAutomationOptions);
		}
	}

	throw new Error(`Unsupported automation engine: ${engine}`);
}
