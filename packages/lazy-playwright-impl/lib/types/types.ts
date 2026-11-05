import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import type { IBrowserBridge, IBrowserCtx, IBridgeOptions } from '../bridge/types';
import type { EnumAutomationEngine, EnumBrowserKind } from './engine';
import type { IBrowserStorageManager, IStorageOptions } from '../storage/types';

/** 可空值 (Nullable)：統一 `undefined` 與 `null` 的表達 */
export type INullable<T> = T | null | undefined;

/** 分頁建立時的監聽器 (Page Listener) */
export type IPageListener = (page: Page) => unknown;

/** 啟動選項：直接沿用 Playwright 的 `LaunchOptions`，不另行定義副本 */
export type ILaunchOptions = LaunchOptions;

/** 建立自動化實例的選項 */
export interface ICreateBrowserAutomationOptions
{
	/** 自動化引擎，決定實作類別；未提供時使用 {@link DEFAULT_AUTOMATION_ENGINE} */
	engine?: EnumAutomationEngine | null;
	/** 底層瀏覽器種類，決定實際啟動的瀏覽器 */
	browser?: EnumBrowserKind;
	/** 啟動選項 */
	launch?: ILaunchOptions;
	/** `BrowserContext` 建立選項 */
	context?: BrowserContextOptions;
	/** Cookie / Session 儲存設定 */
	storage?: IStorageOptions;
	/** 頁面通訊協議設定 */
	bridge?: IBridgeOptions;
}

/**
 * 瀏覽器自動化基底介面 (Base Interface)
 *
 * 所有引擎實作共用的契約：生命週期 (Lifecycle) 與 Cookie / Session 儲存存取。
 * 繼承 {@link IBrowserCtx}，因此實例可直接作為 ctx 傳入。
 * `context` 為目前唯一的存活 context，`page` 為主頁面 (Main Page)。
 *
 * 實作可直接繼承 `AbstractBrowserAutomation`，只需提供啟動選項與瀏覽器建立兩個鉤子 (Hook)。
 */
export interface IBrowserAutomation extends IBrowserCtx
{
	readonly engine: EnumAutomationEngine;
	readonly browserKind: EnumBrowserKind;
	readonly storage: IBrowserStorageManager;
	readonly bridge: IBrowserBridge;

	readonly browser: INullable<Browser>;
	/** 所有已追蹤的頁面 */
	readonly pages: readonly Page[];

	launch(options?: ILaunchOptions): Promise<Browser>;
	newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
	newPage(options?: BrowserContextOptions): Promise<Page>;

	/**
	 * 註冊分頁建立監聽 (Page Listener)
	 *
	 * 已註冊的監聽會保存在實例上，之後任何由本實例建立的 context
	 * 都會自動重新掛載，不會因 context 重建而遺失。
	 *
	 * @param page - 起始分頁，立即觸發一次；`null` 表示不立即觸發
	 * @param listener - 分頁建立時的處理器；重複註冊同一函式會被忽略
	 */
	pageLiveOn(page: INullable<Page>, listener: IPageListener): void;

	close(): Promise<void>;
}
