import { type Browser, type LaunchOptions } from 'playwright';
import { AbstractBrowserAutomation } from './core/browser-automation';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { _playwrightArgsDisableFeatures } from '@lazy-playwright/browser-config/lib/chromium/cli-args';
import { windowSizeLaunchArgs } from '@lazy-playwright/browser-config';
import {
	DEFAULT_PLAYWRIGHT_MODULE_ID,
	IPlaywrightModuleTargetInput,
	playwrightModuleRegistry,
	resolveBrowserType,
	type IPlaywrightModule,
} from '@lazy-playwright/module-registry';
import type { ILaunchOptions } from './types/types';

/**
 * Playwright 瀏覽器自動化實作
 *
 * 以 {@link IBrowserKind} 決定實際啟動的 browser type；
 * 底層啟動改由可插拔的 Playwright 相容模組提供（預設 `playwright`，
 * 可註冊切換 patchright 等反偵測分支，或由外部邏輯組裝的類 Playwright API），
 * Camoufox 實作繼承此類別並覆寫兩個鉤子 (Hook)。
 */
export class PlaywrightBrowserAutomation extends AbstractBrowserAutomation
{
	readonly engine: EnumAutomationEngine = EnumAutomationEngine.Playwright;

	protected async _handleBrowserLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>
	{
		const { args, ...baseOptions } = options;

		return {
			headless: false,
			...baseOptions,
			/** 以 Set 去除重複參數，保留呼叫端指定的 args 優先權；過濾統一由 `launch()` 觸發 */
			args: [...new Set([
				...(args ?? []),
				/** 視窗尺寸；搭配 `viewport: null`，頁面尺寸隨實際視窗 */
				...windowSizeLaunchArgs({
					// browserEngine: this.browserKind,
					browserKind: this.browserKind,
					windowSize: this._options.windowSize,
					args,
				}),
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
}
