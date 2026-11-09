

import type { BrowserContext, Page, Browser } from 'playwright';
import type { ITSRequireAtLeastOne, IPreserveString } from 'ts-type';

/** 命令執行時的上下文 (Context)；`IBrowserAutomation` 亦繼承此介面 */
export interface IBrowserCtx
{
	/** 瀏覽器 / Browser */
	browser?: Browser;
	/** 瀏覽器上下文 / Browser context */
	context?: BrowserContext;
	/** 主頁面 (Main Page)；可能與發出請求的頁面不同 */
	page?: Page;
}

/** 至少包含一個屬性的瀏覽器上下文輸入，僅用於提醒開發者，不代表只需要其中一個屬性 */
export type IBrowserCtxInput = ITSRequireAtLeastOne<IBrowserCtx>;

/**
 * 自動化引擎 (Automation Engine) 與瀏覽器種類 (Browser Kind) 的定義來源
 *
 * 兩者職責分離：引擎決定「實作類別」，瀏覽器種類決定「實際啟動的瀏覽器」。
 * Kept separate: the engine selects the implementation class, the browser kind selects the browser launched.
 */
export const enum EnumAutomationEngine
{
	/** Playwright 引擎 / Playwright engine */
	Playwright = 'playwright',
	Chromium = 'chromium',

	Chrome = 'chrome',
	MSEdge = 'msedge',

	/** Camoufox 引擎 / Camoufox engine */
	Camoufox = 'camoufox',
	Firefox = 'firefox',

	Webkit = 'webkit',
}

export const enum EnumBrowserKindSubChannel
{
	MSEdge_Dev = 'msedge-dev',
	MSEdge_Beta = 'msedge-beta',
	MSEdge_Canary = 'msedge-canary',
}

/**
 * 底層瀏覽器種類：由 {@link EnumAutomationEngine} 選出的實作類別再據此啟動瀏覽器
 * @deprecated 請使用 {@link IBrowserKind} 代替
 */
export const enum EnumBrowserKind
{
	Chromium = 'chromium',
	Chrome = 'chrome',
	Firefox = 'firefox',
	Webkit = 'webkit',
}

/** 預設自動化引擎 */
export const DEFAULT_AUTOMATION_ENGINE = EnumAutomationEngine.Playwright;
/** 預設瀏覽器種類 */
export const DEFAULT_BROWSER_KIND = EnumAutomationEngine.Chromium;

/**
 * 底層瀏覽器種類：由 {@link EnumAutomationEngine} 選出的實作類別再據此啟動瀏覽器
 */
export type IBrowserKind = EnumAutomationEngine.Chromium | EnumAutomationEngine.Firefox | EnumAutomationEngine.Webkit;
export type IBrowserKindChannel = EnumAutomationEngine.Chrome | EnumAutomationEngine.MSEdge | EnumBrowserKindSubChannel | (string & {});

export function _handleBrowserKind(browserEngine: EnumAutomationEngine, channel?: IBrowserKindChannel)
{
	let baseKind: IBrowserKind;

	switch (browserEngine)
	{
		case EnumAutomationEngine.Chrome:
			channel ||= EnumAutomationEngine.Chrome;
		case EnumAutomationEngine.Playwright:
		case EnumAutomationEngine.Chromium:
			baseKind = EnumAutomationEngine.Chromium;
			break;

		case EnumAutomationEngine.MSEdge:
			channel ||= EnumAutomationEngine.MSEdge;
			baseKind = EnumAutomationEngine.Chromium;
			break;

		case EnumAutomationEngine.Firefox:
		case EnumAutomationEngine.Camoufox:
			baseKind = EnumAutomationEngine.Firefox;
			break;

		case EnumAutomationEngine.Webkit:
			baseKind = EnumAutomationEngine.Webkit;
			break;
		default:
			throw new Error(`Unsupported browser kind: ${browserEngine}`);
	}

	return {
		browserEngine,
		baseKind,
		channel,
	};
}
