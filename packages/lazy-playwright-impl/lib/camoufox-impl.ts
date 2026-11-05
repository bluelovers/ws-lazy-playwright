import { launchOptions } from 'camoufox-js';
import { firefox, type Browser, type LaunchOptions } from 'playwright';
import type { ICamoufoxBrowserAutomationOptions, ICamoufoxLaunchOptions, EnumCamoufoxOs } from './camoufox-options';
import { EnumAutomationEngine, EnumBrowserKind } from './types/engine';
import { getCamoufoxFirefoxUserPrefs } from './playwright/camoufox-prefs';
import { _filterUnsupportedFirefoxCliArgs } from './playwright/camoufox-utils';
import { PlaywrightBrowserAutomation } from './playwright-impl';
import type { ILaunchOptions } from './types/types';

/**
 * Camoufox 瀏覽器自動化實作
 *
 * 繼承 {@link PlaywrightBrowserAutomation}，只覆寫啟動選項處理與瀏覽器建立
 * 兩個鉤子 (Hook)，其餘生命週期 (Lifecycle) 與儲存邏輯沿用父類別。
 *
 * @see https://github.com/apify/camoufox-js
 */
export class CamoufoxBrowserAutomation extends PlaywrightBrowserAutomation
{
	override readonly engine: EnumAutomationEngine = EnumAutomationEngine.Camoufox;

	protected readonly _camoufox: ICamoufoxLaunchOptions;
	protected readonly _os?: EnumCamoufoxOs;

	constructor(options: ICamoufoxBrowserAutomationOptions = {})
	{
		super({
			...options,
			browser: options.browser ?? EnumBrowserKind.Firefox,
		});

		this._camoufox = options.camoufox ?? {};
		this._os = options.os;
	}

	protected override async _handleLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>
	{
		const { args, headless, ...baseOptions } = await super._handleLaunchOptions(options);

		const camoufoxOpts = await launchOptions({
			humanize: true,
			geoip: true,
			firefox_user_prefs: getCamoufoxFirefoxUserPrefs(),
			ignoreHTTPSErrors: true,
			locale: ['zh-TW', 'zh-CN', 'zh'],
			timezoneId: 'Asia/Taipei',
			...this._camoufox,
			/** 未指定時交由 `camoufox-js` 決定，避免在此進行環境偵測 */
			...(this._os === undefined
				? {}
				: { os: this._os as NonNullable<ICamoufoxLaunchOptions['os']> }),
		});

		return {
			...baseOptions,
			...camoufoxOpts,
			headless,
			/** 移除 Camoufox 無法識別的 Chromium CLI 參數 */
			args: _filterUnsupportedFirefoxCliArgs([
				...(camoufoxOpts.args ?? []),
				...(args ?? []),
			]),
		};
	}

	protected override async _initializeBrowser(options: LaunchOptions): Promise<Browser>
	{
		return firefox.launch(options);
	}
}
