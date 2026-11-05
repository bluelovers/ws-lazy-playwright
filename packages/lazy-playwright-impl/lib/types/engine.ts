/**
 * 自動化引擎 (Automation Engine) 與瀏覽器種類 (Browser Kind) 的定義來源
 *
 * 兩者職責分離：引擎決定「實作類別」，瀏覽器種類決定「實際啟動的瀏覽器」。
 * Kept separate: the engine selects the implementation class, the browser kind selects the browser launched.
 */
export enum EnumAutomationEngine
{
	/** Playwright 引擎 / Playwright engine */
	Playwright = 'playwright',
	Chromium = 'chromium',
	Chrome = 'chrome',

	/** Camoufox 引擎 / Camoufox engine */
	Camoufox = 'camoufox',
	Firefox = 'firefox',
}

/** 預設自動化引擎 */
export const DEFAULT_AUTOMATION_ENGINE = EnumAutomationEngine.Playwright;

/**
 * 底層瀏覽器種類：由 {@link EnumAutomationEngine} 選出的實作類別再據此啟動瀏覽器
 */
export enum EnumBrowserKind
{
	Chromium = 'chromium',
	Chrome = 'chrome',
	Firefox = 'firefox',
	Webkit = 'webkit',
}

/** 預設瀏覽器種類 */
export const DEFAULT_BROWSER_KIND = EnumBrowserKind.Chromium;
