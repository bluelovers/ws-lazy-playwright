import { console } from 'debug-color2';
import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { PageBridge } from './bridge/index';
import { createDefaultBridgeCommands } from './bridge/default-commands';
import { DEFAULT_BROWSER_KIND, type EnumAutomationEngine, type EnumBrowserKind } from './engine';
import { EnumLogLabel } from './logger';
import { closeBrowserSafely, closeContextSafely } from './playwright/browser-util';
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
 * 實例狀態 (Automation State)
 *
 * - `Preparing`：準備期，可操作臨時 context，分頁全關不觸發自動關閉
 * - `Locked`：已鎖定主 context，監測分頁數並關閉所有非主 context
 */
export enum EnumAutomationState
{
	Preparing = 'preparing',
	Locked = 'locked',
}

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
	readonly bridge: PageBridge;

	protected readonly _options: ICreateBrowserAutomationOptions;
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

	/** 接線中的 context，讓 `browser.on('context')` 與 `newContext()` 共用同一份 Promise */
	protected readonly _boundContexts = new WeakMap<BrowserContext, Promise<void>>();

	/** 釋放舊 context 期間暫停「無分頁即關閉瀏覽器」的判定，避免交換瞬間誤關 */
	protected _suspendAutoClose = false;

	protected _browser: INullable<Browser>;
	protected _context: INullable<BrowserContext>;

	/** 主頁面 (Main Page) */
	protected _page: INullable<Page>;

	/** 目前狀態；預設為準備期，於 context 決定後由 {@link _lockContext} 鎖定 */
	protected _state: EnumAutomationState = EnumAutomationState.Preparing;

	constructor(options: ICreateBrowserAutomationOptions = {})
	{
		this._options = options;
		this.browserKind = options.browser ?? DEFAULT_BROWSER_KIND;
		this.storage = new BrowserStorageManager(options.storage);
		this.bridge = new PageBridge(this, options.bridge);
		this.bridge.registerAll(createDefaultBridgeCommands());
	}

	get browser(): Browser
	{
		return this._browser!;
	}

	/** 目前存活的 context；同一實例同一時間只允許一個 */
	get context(): BrowserContext
	{
		/**
		 * 介面契約為非空，於第一個 context 建立前存取會得到 `undefined`；
		 * 內部一律以 `_context` 判空。
		 */
		return this._context!;
	}

	/** 主頁面 (Main Page)；可直接指派以更換 */
	get page(): Page
	{
		/**
		 * 介面契約為非空，因為在建立 context 後會立即設定主頁面，
		 * 在建立 context 或 第一個頁面建立前存取會得到 `undefined`。
		 */
		return this._page;
	}

	set page(next: Page)
	{
		if (!next)
		{
			throw new TypeError('page cannot be set to undefined or not a Page instance');
		}
		else if (!this._pages.has(next))
		{
			throw new RangeError('page is not in the current context');
		}
		this._page = next;
	}

	/** 目前狀態 */
	get state(): EnumAutomationState
	{
		return this._state;
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

		/** 讓直接以 `browser.newContext()` 建立的 context 也自動接線，並維持單一 context 不變式 */
		this._browser.on('context', (context) =>
		{
			void this._bindContext(context).catch((e) =>
			{
				console.error(EnumLogLabel.BrowserAutomation, 'context bind failed:', e);
			});
		});

		return this._browser;
	}

	async newContext(options: BrowserContextOptions = {}): Promise<BrowserContext>
	{
		const browser = await this.launch();

		/** 鎖定狀態下維持單一 context；準備期允許臨時 context 共存 */
		if (this._state === EnumAutomationState.Locked)
		{
			await this._releaseContext();
		}

		const context = await browser.newContext({
			...this._options.context,
			...options,
		});

		try
		{
			await this._lockContext(context);
		}
		catch (e)
		{
			/** 通訊協議接線失敗時不留殘留的空 context */
			await closeContextSafely(context);
			throw e;
		}

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
		const context = this._context;
		const browser = this._browser;

		this._browser = undefined;
		this._context = undefined;
		this._page = undefined;
		this._pages.clear();

		await closeBrowserSafely({
			pages,
			contexts: context ? [context] : [],
			browser,
		});
	}

	/**
	 * 釋放目前的 context，維持「同一實例同一時間只有一個存活 context」
	 *
	 * 關閉過程會使該 context 的分頁陸續關閉，若不暫停會誤觸「無分頁即關閉瀏覽器」。
	 */
	protected async _releaseContext(): Promise<void>
	{
		const context = this._context;

		if (!context) return;

		this._context = undefined;
		this._suspendAutoClose = true;

		try
		{
			await closeContextSafely(context);
		}
		finally
		{
			this._suspendAutoClose = false;
		}
	}

	/**
	 * 進入準備期
	 *
	 * 允許臨時 context 共存，且所有分頁關閉時不觸發實例自動關閉。
	 */
	protected _beginPrepare(): void
	{
		this._state = EnumAutomationState.Preparing;
	}

	/**
	 * 建立臨時 context
	 *
	 * 不切換主 context、不鎖定狀態，供啟動階段的探索流程使用；
	 * 決定主 context 後再呼叫 {@link _lockContext}，非主 context 會被一併關閉。
	 */
	protected async _newTemporaryContext(options: BrowserContextOptions = {}): Promise<BrowserContext>
	{
		if (this._state !== EnumAutomationState.Preparing)
		{
			throw new Error('temporary context is only available while preparing');
		}

		const browser = await this.launch();

		return browser.newContext({
			...this._options.context,
			...options,
		});
	}

	/**
	 * 鎖定主 context
	 *
	 * 關閉所有非主 context，接線主 context 後切換至 {@link EnumAutomationState.Locked}，
	 * 自此分頁數監測生效：所有分頁關閉即自動關閉實例。
	 */
	protected async _lockContext(primary: BrowserContext): Promise<void>
	{
		this._suspendAutoClose = true;

		try
		{
			const others = (this._browser?.contexts() ?? [])
				.filter(context => context !== primary);

			await Promise.all(others.map(context => closeContextSafely(context)));

			this._context = primary;

			await this._bindContext(primary);

			/** 鎖定後：已存在的第一個頁面即為主頁面，否則由之後新開的頁面接任 */
			this._page = primary.pages()[0];

			this._state = EnumAutomationState.Locked;
		}
		finally
		{
			this._suspendAutoClose = false;
		}
	}

	/**
	 * 接線 context
	 *
	 * `browser.on('context')` 與 `newContext()` 兩條路徑共用同一份 Promise，
	 * 保證同一 context 只接線一次。
	 */
	protected _bindContext(context: BrowserContext): Promise<void>
	{
		let pending = this._boundContexts.get(context);

		if (!pending)
		{
			pending = this._bindContextCore(context);
			this._boundContexts.set(context, pending);
		}

		return pending;
	}

	protected async _bindContextCore(context: BrowserContext): Promise<void>
	{
		/** 鎖定狀態下維持單一 context；準備期允許臨時 context 共存 */
		if (this._state === EnumAutomationState.Locked && this._context && this._context !== context)
		{
			await this._releaseContext();
		}

		this._context = context;

		context.on('page', page => this._bindPage(page));
		context.on('close', () =>
		{
			if (this._context === context)
			{
				this._context = undefined;
			}
		});

		await this.bridge.install(context);
		this._wirePageLiveOnOnContext(context);
	}

	protected _bindPage(page: Page): void
	{
		this._pages.add(page);

		/** 鎖定後，尚無主頁面時由新開啟的頁面接任 */
		if (this._state === EnumAutomationState.Locked && !this._page)
		{
			this._page = page;
		}

		page.on('close', () =>
		{
			this._pages.delete(page);

			/** 主頁面關閉後，由下一個頁面自動繼承 */
			if (this._page === page)
			{
				this._page = this._pages.values().next().value;
			}

			this._handleNoRemainingPages();
		});
	}

	/**
	 * 最後一個分頁關閉後瀏覽器視窗已不可見，
	 * 主動關閉瀏覽器與所有 context，避免殘留無視窗的背景程序
	 *
	 * 僅在鎖定狀態下監測；準備期與 context 交換期間會跳過。
	 * `close()` 會先同步清空追蹤集合並將 `_browser` 設為 undefined，
	 * 因此關閉過程觸發的分頁 close 事件不會重複進入關閉流程。
	 */
	protected _handleNoRemainingPages(): void
	{
		if (this._state !== EnumAutomationState.Locked) return;
		if (this._suspendAutoClose) return;
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
