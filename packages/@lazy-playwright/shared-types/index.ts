

import type { BrowserContext, Page, Browser } from 'playwright';
import type { ITSRequireAtLeastOne, IPreserveString } from 'ts-type';

/** 命令執行時的上下文 (Context)；`IBrowserAutomation` 亦繼承此介面 */
export interface IBrowserCtx
{
	/** 瀏覽器 */
	browser?: Browser;
	/** 瀏覽器上下文 */
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
 */
export const enum EnumAutomationEngine
{
	/** Playwright 引擎 */
	Playwright = 'playwright',
	/** Chromium 瀏覽器 */
	Chromium = 'chromium',

	/** Chrome 瀏覽器；亦作為通道 (Channel) 選項 */
	Chrome = 'chrome',
	/** Microsoft Edge 瀏覽器；亦作為通道 (Channel) 選項 */
	MSEdge = 'msedge',

	/** Camoufox 引擎 */
	Camoufox = 'camoufox',
	/** Firefox 瀏覽器 */
	Firefox = 'firefox',

	/** WebKit 瀏覽器 */
	Webkit = 'webkit',
}


export const enum EnumBrowserKindSubChannel
{
	/** Microsoft Edge 的預覽發布通道 (Preview Release Channel) */

	MSEdge_Beta = 'msedge-beta',
	MSEdge_Canary = 'msedge-canary',
	MSEdge_Dev = 'msedge-dev',

	/** Chrome 的預覽發布通道 (Preview Release Channel) */

	Chrome_Beta = 'chrome-beta',
	Chrome_Canary = 'chrome-canary',

	/* --- */
}

/**
 * 底層瀏覽器種類：由 {@link EnumAutomationEngine} 選出的實作類別再據此啟動瀏覽器
 * @deprecated 請使用 {@link IBrowserKind} 代替
 */
const enum EnumBrowserKind
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
 * 底層瀏覽器種類 (Base Browser Kind)：由 {@link EnumAutomationEngine} 歸一化而來，
 * 實作類別據此啟動對應的瀏覽器
 */
export type IBrowserKind = EnumAutomationEngine.Chromium | EnumAutomationEngine.Firefox | EnumAutomationEngine.Webkit;
/**
 * 可指定的瀏覽器通道 (Channel)：內建 Chrome、MS Edge 及其預覽通道，
 * 亦接受任意字串以涵蓋未列舉的通道名稱
 */
export type IBrowserKindChannel = EnumAutomationEngine.Chrome | EnumAutomationEngine.MSEdge | EnumBrowserKindSubChannel | (string & {});

/**
 * 將自動化引擎 (Automation Engine) 歸一化為可啟動的基礎瀏覽器種類 (Base Kind) 的結果
 */
export interface IHandleBrowserKindResult
{
	/** 引擎 */
	browserEngine: EnumAutomationEngine;
	/** 歸一化後的基礎種類 */
	baseKind: IBrowserKind;
	/** 最終通道；Chrome / MS Edge 未指定通道時補入自身值 */
	channel?: IBrowserKindChannel;
}

/**
 * 將自動化引擎 (Automation Engine) 歸一化為可啟動的基礎瀏覽器種類 (Base Kind)
 *
 * @param browserEngine - 自動化引擎
 * @param channel - 可選的瀏覽器通道
 * @returns 原引擎、歸一化後的基礎種類與最終通道；Chrome / MS Edge 未指定通道時補入自身值
 * @throws 未支援的引擎 / Unsupported engine
 */
export function _handleBrowserKind(browserEngine: EnumAutomationEngine, channel?: IBrowserKindChannel): IHandleBrowserKindResult
{
	let baseKind: IBrowserKind;

	/**
	 * 引擎名稱與實際啟動的瀏覽器未必相同，此處統一歸一化為基礎種類
	 */
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
