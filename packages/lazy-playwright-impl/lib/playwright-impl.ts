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
			headless: false,
			...baseOptions,
			/** 以 Set 去除重複參數，保留呼叫端指定的 args 優先權 */
			args: [...new Set([
				...(args ?? []),
				_playwrightArgsDisableFeatures(),

				// '--remote-debugging-port=9222',
				// '--remote-debugging-address=127.0.0.1',
				// `--disable-features`, `${disableFeatures.join(',')}`,

				/** 允許跨站點同源策略放寬（使 SSO 授權可順利傳遞） / Allow cross-origin for SSO */
				'--disable-web-security',

				/** 允許背景跳轉與彈出視窗（許多 SSO 登入依賴背景 Popup/Redirect） / Allow popups for SSO */
				'--disable-popup-blocking',

				/** 保留完整的同源政策與 LocalStorage 存取 / Retain same-origin policy & LocalStorage */
				'--allow-running-insecure-content',

				/** 關鍵：停用強制無痕分頁與隱私防護旗標 / Disable incognito & privacy sandbox */
				'--incognito=false',
				// '--incognito', 'false',
				'--disable-privacy-sandbox',

				'--lang=zh-TW',
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
