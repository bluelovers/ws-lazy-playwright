import { launchOptions } from 'camoufox-js';
import { firefox, type Browser, type LaunchOptions } from 'playwright';
import type { ICamoufoxBrowserAutomationOptions, ICamoufoxLaunchOptions, EnumCamoufoxOs } from './camoufox-options';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
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
			/** 未指定時以 Camoufox 引擎建立，種類 (Kind) 歸一化為 Firefox */
			engine: options.engine || EnumAutomationEngine.Camoufox,
		});

		this._camoufox = options.camoufox ?? {};
		this._os = options.os;
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
		const camoufoxOpts = this._options.channel === EnumAutomationEngine.Firefox
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
				ignoreHTTPSErrors: true,
				locale: ['zh-TW', 'zh-CN', 'zh'],
				timezoneId: 'Asia/Taipei',
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
			...camoufoxOpts,
			headless,
			/** 移除 Firefox 無法識別的 Chromium CLI 參數（含交叉解析後殘留的 `--window-size`） */
			args: _filterUnsupportedFirefoxCliArgs(args ?? []),
		};
	}

	protected override async _initializeBrowser(options: LaunchOptions): Promise<Browser>
	{
		return firefox.launch(options);
	}
}
