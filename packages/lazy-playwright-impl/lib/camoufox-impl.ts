import { launchOptions, Camoufox, NewContext } from 'camoufox';
import { BrowserContext, BrowserContextOptions, type Browser, type LaunchOptions } from 'playwright';
import type { ICamoufoxBrowserAutomationOptions, EnumCamoufoxOs } from './camoufox-options';
import type { ICamoufoxLaunchOptions } from '@lazy-playwright/browser-config/lib/firefox/camoufox-types';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { getCamoufoxFirefoxUserPrefs } from '@lazy-playwright/browser-config/lib/firefox/firefox-prefs';
import { PlaywrightBrowserAutomation } from './playwright-impl';
import type { ILaunchOptions } from './types/types';
import { ICamoufoxNewBrowserOptionsInput, newCamoufox, newCamoufoxContext } from '@lazy-playwright/camoufox-npm';

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
			/** 未指定時以 Camoufox 引擎建立，種類 (Kind) 歸一化為 Firefox */
			engine: options.engine || EnumAutomationEngine.Camoufox,
		});

		this._camoufox = options.camoufox ?? {};
		this._os = options.os;
	}

	/**
	 * 是否以 Camoufox 啟動取決於是否呼叫 camoufox-js 的 `launchOptions`：
	 * `channel: 'firefox'` 以原生 Firefox 啟動，略過 Camoufox 專屬啟動設定，
	 */
	protected _isUsingPlaywrightFirefox(): this is { _options: { channel: EnumAutomationEngine.Firefox } }
	{
		return this._options.channel === EnumAutomationEngine.Firefox;
	}

	protected override async _handleBrowserLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>
	{
		const firefoxUserPrefs = getCamoufoxFirefoxUserPrefs();
		const _sharedOpts: ILaunchOptions = {};

		/**
		 * 是否以 Camoufox 啟動取決於是否呼叫 camoufox-js 的 `launchOptions`：
		 * `channel: 'firefox'` 以原生 Firefox 啟動，略過 Camoufox 專屬啟動設定，
		 * 其餘啟動設定處理與 Chromium CLI 參數過濾一律執行。
		 */
		const camoufoxOpts = this._isUsingPlaywrightFirefox()
			? {
				..._sharedOpts,
				firefoxUserPrefs: {
					...firefoxUserPrefs,
					...options.firefoxUserPrefs,
				},
			}
			: await launchOptions({
				..._sharedOpts,
				humanize: true,
				geoip: true,
				firefox_user_prefs: firefoxUserPrefs,
				ignoreHTTPSErrors: this._options.ignoreHTTPSErrors ?? true,
				locale: [this._options.locale ?? 'zh-TW', 'zh-TW', 'zh-CN', 'zh'],
				timezoneId: this._options.timezoneId ?? 'Asia/Taipei',
				...this._camoufox,
				/** 未指定時交由 `camoufox-js` 決定，避免在此進行環境偵測 */
				...(this._os === undefined
					? {}
					: { os: this._os as NonNullable<ICamoufoxLaunchOptions['os']> }),
			});

		/**
		 * 先併入 camoufox 專屬參數再交由父別解析，
		 * 視窗尺寸的自身 / 交叉風格判斷才能看到完整參數集。
		 */
		const { args, headless, ...baseOptions } = await super._handleBrowserLaunchOptions({
			...options,
			args: [
				...(camoufoxOpts.args ?? []),
				...(options.args ?? []),
			],
		});

		return {
			...baseOptions,
			from_options: camoufoxOpts,
			...camoufoxOpts,
			headless,
			/** 參數過濾統一由 `launch()` 的基底方法觸發（含交叉解析後殘留的 `--window-size`） */
			args: args ?? [],
		} as ICamoufoxNewBrowserOptionsInput as LaunchOptions;
	}

	protected override async _initializeBrowser(options: LaunchOptions): Promise<Browser>
	{
		return newCamoufox(options, this._isUsingPlaywrightFirefox()) as any;
	}

	protected override async _newContext(options?: BrowserContextOptions, autoLaunchBrowser?: boolean)
	{
		/** 確保瀏覽器已啟動，後續 `this.browser` 才非空 */
		if (autoLaunchBrowser)
		{
			await this.launch();
		}

		const context = await newCamoufoxContext(this.browser, this._handleContextOptions(options), this._isUsingPlaywrightFirefox());
		return context;
	}

}
