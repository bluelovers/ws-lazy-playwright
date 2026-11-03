import { chromium, firefox, webkit, type Browser, type LaunchOptions } from 'playwright';
import { AbstractBrowserAutomation } from './browser-automation';
import { EnumAutomationEngine, EnumBrowserKind } from './engine';
import { _playwrightArgsDisableFeatures } from './playwright/config';
import type { ILaunchOptions } from './types';

/**
 * Playwright 瀏覽器自動化實作
 *
 * 以 {@link EnumBrowserKind} 決定實際啟動的 browser type；
 * Camoufox 實作繼承此類別並覆寫兩個鉤子 (Hook)。
 */
export class PlaywrightBrowserAutomation extends AbstractBrowserAutomation
{
	readonly engine: EnumAutomationEngine = EnumAutomationEngine.Playwright;

	protected async _handleLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>
	{
		const { args, ...baseOptions } = options;

		return {
			...baseOptions,
			/** 以 Set 去除重複參數，保留呼叫端指定的 args 優先權 */
			args: [...new Set([
				...(args ?? []),
				_playwrightArgsDisableFeatures(),
			])],
		};
	}

	protected async _initializeBrowser(options: LaunchOptions): Promise<Browser>
	{
		switch (this.browserKind)
		{
			case EnumBrowserKind.Chrome:
				return chromium.launch({ ...options, channel: 'chrome' });
			case EnumBrowserKind.Firefox:
				return firefox.launch(options);
			case EnumBrowserKind.Webkit:
				return webkit.launch(options);
			case EnumBrowserKind.Chromium:
			default:
				return chromium.launch(options);
		}
	}
}
