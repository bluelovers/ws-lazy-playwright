import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { DEFAULT_BROWSER_KIND, type EnumAutomationEngine, type EnumBrowserKind } from './engine';
import { closeBrowserSafely } from './playwright/browser-util';
import { pageLiveOn as _pageLiveOn } from './playwright/event';
import { BrowserStorageManager } from './storage';
import type {
	IPageListener,
	IBrowserAutomation,
	ICreateBrowserAutomationOptions,
	ILaunchOptions,
	INullable,
} from './types';

/**
 * 瀏覽器自動化抽象基底
 *
 * 提供共用的生命週期 (Lifecycle)、分頁追蹤與 Cookie / Session 儲存存取；
 * 子類別只需實作兩個鉤子 (Hook)：
 *
 * - `_handleLaunchOptions`：轉換或疊加引擎專屬的啟動設定
 * - `_initializeBrowser`：以處理後的選項建立瀏覽器實例
 */
export abstract class AbstractBrowserAutomation implements IBrowserAutomation
{
	abstract readonly engine: EnumAutomationEngine;

	readonly browserKind: EnumBrowserKind;
	readonly storage: BrowserStorageManager;

	protected readonly _options: ICreateBrowserAutomationOptions;
	protected readonly _contexts = new Set<BrowserContext>();
	protected readonly _pages = new Set<Page>();

	/**
	 * 已註冊的分頁監聽 (Page Listener)
	 *
	 * 保存在實例上而非單一 context，任何由本實例建立的 context 都會自動繼承，
	 * 因此 context 被重建時監聽不會遺失。
	 */
	protected readonly _pageLiveOnListeners = new Set<IPageListener>();

	/** 已接線過的 context，避免同一監聽被重複掛載 */
	protected readonly _wiredContexts = new WeakSet<BrowserContext>();

	protected _browser: INullable<Browser>;
	protected _context: INullable<BrowserContext>;

	constructor(options: ICreateBrowserAutomationOptions = {})
	{
		this._options = options;
		this.browserKind = options.browser ?? DEFAULT_BROWSER_KIND;
		this.storage = new BrowserStorageManager(options.storage);
	}

	get browser(): INullable<Browser>
	{
		return this._browser;
	}

	/** 最近一次建立的 context */
	get context(): INullable<BrowserContext>
	{
		return this._context;
	}

	get contexts(): readonly BrowserContext[]
	{
		return [...this._contexts];
	}

	get pages(): readonly Page[]
	{
		return [...this._pages];
	}

	/** 將輸入選項轉為 Playwright 的啟動選項，子類別可於此疊加引擎專屬設定 */
	protected abstract _handleLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>;

	/** 以處理後的選項建立瀏覽器實例，子類別決定實際使用的 browser type */
	protected abstract _initializeBrowser(options: LaunchOptions): Promise<Browser>;

	async launch(options: ILaunchOptions = {}): Promise<Browser>
	{
		/** 已連線時直接重用，避免重複啟動程序 */
		if (this._browser?.isConnected())
		{
			return this._browser;
		}

		const launchOptions = await this._handleLaunchOptions({
			...this._options.launch,
			...options,
		});

		this._browser = await this._initializeBrowser(launchOptions);

		/** 讓直接以 `browser.newContext()` 建立的 context 也自動繼承已註冊的分頁監聽 */
		this._browser.on('context', context => this._wirePageLiveOnOnContext(context));

		return this._browser;
	}

	async newContext(options: BrowserContextOptions = {}): Promise<BrowserContext>
	{
		const browser = await this.launch();

		const context = await browser.newContext({
			...this._options.context,
			...options,
		});

		this._bindContext(context);
		return context;
	}

	async newPage(options: BrowserContextOptions = {}): Promise<Page>
	{
		const context = this._context ?? await this.newContext(options);

		const page = await context.newPage();
		this._bindPage(page);

		return page;
	}

	async close(): Promise<void>
	{
		const pages = this.pages;
		const contexts = this.contexts;
		const browser = this._browser;

		this._browser = undefined;
		this._context = undefined;
		this._contexts.clear();
		this._pages.clear();

		await closeBrowserSafely({ pages, contexts, browser });
	}

	/**
	 * 註冊 context 並追蹤其自動產生的分頁，
	 * 確保 `close()` 能完整關閉所有分頁與 context
	 */
	protected _bindContext(context: BrowserContext): void
	{
		this._context = context;
		this._contexts.add(context);

		this._wirePageLiveOnOnContext(context);

		context.on('page', page => this._bindPage(page));
		context.on('close', () =>
		{
			this._contexts.delete(context);
			if (this._context === context)
			{
				this._context = undefined;
			}
		});
	}

	protected _bindPage(page: Page): void
	{
		this._pages.add(page);
		page.on('close', () =>
		{
			this._pages.delete(page);
			this._handleNoRemainingPages();
		});
	}

	/**
	 * 最後一個分頁關閉後瀏覽器視窗已不可見，
	 * 主動關閉瀏覽器與所有 context，避免殘留無視窗的背景程序
	 *
	 * `close()` 會先同步清空追蹤集合並將 `_browser` 設為 undefined，
	 * 因此關閉過程觸發的分頁 close 事件不會重複進入關閉流程
	 */
	protected _handleNoRemainingPages(): void
	{
		if (this._pages.size > 0) return;
		if (!this._browser?.isConnected()) return;

		void this.close();
	}

	/**
	 * 註冊分頁建立監聽 (Page Listener)
	 *
	 * 監聽保存在實例上，之後建立的每個 context 都會自動重新掛載；
	 * 若目前已有 context 則立即接線並對 `page` 觸發一次。
	 *
	 * @param page - 起始分頁，立即觸發一次；`null` 表示不立即觸發
	 * @param listener - 分頁建立時的處理器；重複註冊同一函式會被忽略
	 */
	pageLiveOn(page: INullable<Page>, listener: IPageListener): void
	{
		const isFirstRegistration = !this._pageLiveOnListeners.has(listener);
		this._pageLiveOnListeners.add(listener);

		/** 已註冊過的監聽不重複接線，避免同一事件被呼叫兩次 */
		if (isFirstRegistration && this._context)
		{
			_pageLiveOn(this, page, listener);
		}
	}

	/**
	 * 將所有已註冊的分頁監聽接線至指定 context
	 *
	 * 由 `_bindContext` 與 `browser.on('context')` 兩條路徑共同呼叫，
	 * 以 `_wiredContexts` 保證同一 context 只接線一次。
	 */
	protected _wirePageLiveOnOnContext(context: BrowserContext): void
	{
		if (this._wiredContexts.has(context)) return;
		this._wiredContexts.add(context);

		for (const listener of this._pageLiveOnListeners)
		{
			_pageLiveOn({ context }, null, listener);
		}
	}
}
