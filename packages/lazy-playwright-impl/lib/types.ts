import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import type { EnumAutomationEngine, EnumBrowserKind } from './engine';
import type { IBrowserStorageManager, IStorageOptions } from './storage/types';

/** 可空值 (Nullable)：統一 `undefined` 與 `null` 的表達 */
export type INullable<T> = T | null | undefined;

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
}

/**
 * 瀏覽器自動化基底介面 (Base Interface)
 *
 * 所有引擎實作共用的契約：生命週期 (Lifecycle) 與 Cookie / Session 儲存存取。
 * 實作可直接繼承 `AbstractBrowserAutomation`，只需提供啟動選項與瀏覽器建立兩個鉤子 (Hook)。
 */
export interface IBrowserAutomation
{
	readonly engine: EnumAutomationEngine;
	readonly browserKind: EnumBrowserKind;
	readonly storage: IBrowserStorageManager;

	readonly browser: INullable<Browser>;
	readonly context: INullable<BrowserContext>;
	readonly pages: readonly Page[];

	launch(options?: ILaunchOptions): Promise<Browser>;
	newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
	newPage(options?: BrowserContextOptions): Promise<Page>;
	close(): Promise<void>;
}
