import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import type { IBrowserBridge, IBridgeOptions } from '../bridge/types';
import type { EnumAutomationEngine, IBrowserKind, IBrowserKindChannel } from '@lazy-playwright/shared-types';
import type { IPlaywrightModule, IPlaywrightModuleId } from '../core/module-registry';
import type { IBrowserStorageManager, IStorageOptions } from '../storage/types';
import { ICreateNewPageOptions } from '@lazy-playwright/util-page/lib/open-new-util';
import { IBrowserCtx, IBrowserCtxInput } from '@lazy-playwright/shared-types';
import { ITSRequiredWith, ITSNullable } from 'ts-type';

/** 分頁建立時的監聽器 (Page Listener) */
export type IPageListener = (page: Page) => unknown;

/** 啟動選項：直接沿用 Playwright 的 `LaunchOptions`，不另行定義副本 */
export type ILaunchOptions = LaunchOptions;

/** 視窗尺寸 (Window Size)，單位為像素 */
export interface IWindowSize
{
	width: number;
	height: number;
}

/** 建立自動化實例的選項 */
export interface ICreateBrowserAutomationOptions
{
	/**
	 * 自動化引擎，決定實作類別；未提供時使用 {@link DEFAULT_AUTOMATION_ENGINE}
	 *
	 * 未指定 `channel` 時，其通道 (Channel) 變體（`chrome` / `msedge`）一併決定啟動的瀏覽器。
	 */
	engine?: EnumAutomationEngine;
	/**
	 * Playwright 相容模組：註冊的模組 id，或直接提供的模組描述；
	 * 未提供時使用預設 `playwright`（僅 Playwright 引擎類別使用）
	 */
	module?: IPlaywrightModuleId | IPlaywrightModule;
	/**
	 * 啟動目標 (Launch Target)：通道 (Channel) 變體（`chrome` / `msedge` / `msedge-dev` …），
	 * 或 `firefox` 指定原生 Firefox (Native Firefox)
	 */
	channel?: IBrowserKindChannel;
	/** 啟動選項 */
	launch?: ILaunchOptions;
	/**
	 * 預設視窗尺寸 (Window Size)
	 *
	 * `context.viewport` 預設為 `null`，頁面尺寸隨實際視窗，
	 * 此處設定瀏覽器啟動時的視窗大小；未設定時由瀏覽器自行決定。
	 * 呼叫端若已於 `launch` 指定對應參數，則以呼叫端為準。
	 */
	windowSize?: IWindowSize;
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
export interface IBrowserAutomation extends ITSRequiredWith<IBrowserCtx, 'context'>
{
	readonly engine: EnumAutomationEngine;
	readonly browserKind: IBrowserKind;
	readonly storage: IBrowserStorageManager;
	readonly bridge: IBrowserBridge;

	readonly browser: ITSNullable<Browser>;
	/** 所有已追蹤的頁面 */
	readonly pages: readonly Page[];

	launch(options?: ILaunchOptions): Promise<Browser>;
	newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
	newPage(options?: ICreateNewPageOptions): Promise<Page>;

	/**
	 * 註冊分頁建立監聽 (Page Listener)
	 *
	 * 已註冊的監聽會保存在實例上，之後任何由本實例建立的 context
	 * 都會自動重新掛載，不會因 context 重建而遺失。
	 *
	 * @param page - 起始分頁，立即觸發一次；`null` 表示不立即觸發
	 * @param listener - 分頁建立時的處理器；重複註冊同一函式會被忽略
	 */
	pageLiveOn(page: ITSNullable<Page>, listener: IPageListener): void;

	close(): Promise<void>;
}
