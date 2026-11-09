import { console } from 'debug-color2';
import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { PageBridge } from '../bridge/index';
import { createDefaultBridgeCommands } from '../bridge/default-commands';
import { DEFAULT_BROWSER_KIND, _handleBrowserKind, EnumAutomationEngine, type IBrowserKind, type IBrowserKindChannel } from '@lazy-playwright/shared-types';
import { EnumLogLabel } from '../logger';
import { closeBrowserSafely, closeContextSafely } from '../playwright/browser-util';
import { pageLiveOn as _pageLiveOn } from '../playwright/event';
import { gotoPage, type IGotoOptions, type IGotoResult } from '@lazy-playwright/util-page/lib/goto-util';
import { isPageLike } from '../playwright/type-guard';
import { BrowserStorageManager } from '../storage';
import { DEFAULT_STORAGE_ID } from '../storage/types';
import type {
	IPageListener,
	IBrowserAutomation,
	ICreateBrowserAutomationOptions,
	ILaunchOptions,
	IWindowSize,
} from '../types/types';
import { createNewPage, ICreateNewPageOptions } from '@lazy-playwright/util-page/lib/open-new-util';
import { ITSNullable } from 'ts-type';

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
 * - `_handleBrowserLaunchOptions`：轉換或疊加引擎專屬的啟動設定
 * - `_initializeBrowser`：以處理後的選項建立瀏覽器實例
 */
export abstract class AbstractBrowserAutomation implements IBrowserAutomation
{
	abstract readonly engine: EnumAutomationEngine;

	/** 底層瀏覽器種類（base kind），決定實際啟動的瀏覽器 */
	readonly browserKind: IBrowserKind;
	/** 瀏覽器通道 (Channel)：Chrome / MSEdge 等變體；未指定時為 `undefined` */
	readonly browserChannel?: IBrowserKindChannel;
	/** Cookie / Session 儲存管理 */
	readonly storage: BrowserStorageManager;
	/** 頁面通訊協定 (Bridge)，負責 context / 分頁的命令收發 */
	readonly bridge: PageBridge;

	/** 建立時的選項快取，供啟動與 context 建立時合併 */
	protected readonly _options: ICreateBrowserAutomationOptions;
	/** 已追蹤的分頁集合 */
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

	/** 目前瀏覽器實例；未啟動時為空 */
	protected _browser: ITSNullable<Browser>;
	/** 目前主 context；未建立時為空 */
	protected _context: ITSNullable<BrowserContext>;

	/** 主頁面 (Main Page) */
	protected _page: ITSNullable<Page>;

	/** 目前狀態；預設為準備期，於 context 決定後由 {@link _lockContext} 鎖定 */
	protected _state: EnumAutomationState = EnumAutomationState.Preparing;

	/** 依選項建立儲存管理器與通訊橋，並掛上預設通訊命令 */
	constructor(options: ICreateBrowserAutomationOptions = {})
	{
		this._options = options;
		/**
		 * 以 `_handleBrowserKind` 正規化啟動目標：
		 *
		 * `channel: 'firefox'` 以種類 (Kind) 身分決定原生 Firefox (Native Firefox)，
		 * 由 Camoufox 實作處理啟動設定與參數過濾；其餘 `channel` 為通道 (Channel) 變體；
		 * 皆未指定時由 `engine` 決定。
		 */
		const nativeFirefox = options.channel === EnumAutomationEngine.Firefox;
		const { baseKind, channel } = _handleBrowserKind(
			nativeFirefox ? EnumAutomationEngine.Firefox : options.engine ?? DEFAULT_BROWSER_KIND,
			nativeFirefox ? undefined : options.channel,
		);

		this.browserKind = baseKind;
		this.browserChannel = channel;
		this.storage = new BrowserStorageManager(options.storage);
		this.bridge = new PageBridge(this, options.bridge);
		this.bridge.registerAll(createDefaultBridgeCommands());
	}

	/** 目前瀏覽器實例；啟動前存取為 undefined（內部一律以 `_browser` 判空） */
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

	/**
	 * 主頁面 (Main Page)；可直接指派以更換
	 *
	 * 以 {@link isPageLike} 作簡易防護，非 Page-like 的值直接拒絕。
	 */
	get page(): Page
	{
		/**
		 * 介面契約為非空，因為在建立 context 後會立即設定主頁面，
		 * 在建立 context 或 第一個頁面建立前存取會得到 `undefined`。
		 */
		return this._page ??= this._pages.values().next().value;
	}

	set page(next: Page)
	{
		if (!isPageLike(next))
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

	/** 目前追蹤中的所有分頁（快照） */
	get pages(): readonly Page[]
	{
		return [...this._pages];
	}

	/**
	 * 建立時指定的預設視窗尺寸 (Window Size)
	 *
	 * `context.viewport` 預設為 `null`，頁面尺寸隨實際視窗，
	 * 因此視窗大小改由啟動參數決定；未設定時回傳 `undefined`，交由瀏覽器自行決定。
	 */
	protected get _windowSize(): IWindowSize | undefined
	{
		return this._options.windowSize;
	}

	/** 將輸入選項轉為 Playwright 的啟動選項，子類別可於此疊加引擎專屬設定 */
	protected abstract _handleBrowserLaunchOptions(options: ILaunchOptions): Promise<LaunchOptions>;

	/** 以處理後的選項建立瀏覽器實例，子類別決定實際使用的 browser type */
	protected abstract _initializeBrowser(options: LaunchOptions): Promise<Browser>;

	/**
	 * 啟動瀏覽器
	 *
	 * @param options - 啟動選項
	 * @returns 已連線的瀏覽器實例
	 */
	async launch(options: ILaunchOptions = {}): Promise<Browser>
	{
		/** 已連線時直接重用，避免重複啟動程序 */
		if (this._browser?.isConnected())
		{
			return this._browser;
		}

		const launchOptions = await this._handleBrowserLaunchOptions({
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

	/**
	 * 合併 context 選項，優先序：本次輸入 > `context` > 建立選項專用欄位（`locale` 等） > 內建預設
	 */
	protected _handleContextOptions(options: BrowserContextOptions = {})
	{
		options = {
			viewport: null,
			ignoreHTTPSErrors: this._options.ignoreHTTPSErrors ?? true,
			locale: this._options.locale ?? 'zh-TW',
			timezoneId: this._options.timezoneId ?? 'Asia/Taipei',
			...this._options.context,
			...options,
		};
		return options;
	}

	/**
	 * 以處理後的選項建立 context
	 *
	 * @param options - context 建立選項
	 * @param autoLaunchBrowser - 建立前先確保瀏覽器已啟動
	 * @returns 建立的 context
	 */
	protected async _newContext(options?: BrowserContextOptions, autoLaunchBrowser?: boolean)
	{
		/** 確保瀏覽器已啟動，後續 `this.browser` 才非空 */
		if (autoLaunchBrowser)
		{
			await this.launch();
		}

		const context = await this.browser.newContext(this._handleContextOptions(options));
		return context;
	}

	/**
	 * 還原登入狀態至指定 context
	 *
	 * 由 `storage.restore` 啟用，於 {@link newContext} 建立 context 後、鎖定前執行，
	 * 呼叫端不需再自行組裝 Cookie / Session 還原流程；
	 * 尚未儲存過時僅記錄，後續頁面會以未登入狀態開啟。
	 */
	protected async _restoreStorageState(context: BrowserContext): Promise<void>
	{
		const restore = this._options.storage?.restore;

		if (!restore) return;

		const id = typeof restore === 'object' ? restore.id ?? DEFAULT_STORAGE_ID : DEFAULT_STORAGE_ID;

		const cookies = await this.storage.cookies.apply(id, context);
		const sessions = await this.storage.sessions.restore(id, context);

		console.log(EnumLogLabel.BrowserAutomation, `storage restored [${id}] cookies: ${cookies}, session: ${sessions}`);
	}

	/**
	 * 建立新 context 並鎖定為主 context；鎖定狀態下以新 context 取代原主 context
	 *
	 * `storage.restore` 啟用時於鎖定前還原登入狀態。
	 *
	 * @param options - context 建立選項
	 * @returns 建立的 context
	 */
	async newContext(options?: BrowserContextOptions): Promise<BrowserContext>
	{
		/** 鎖定狀態下維持單一 context；準備期允許臨時 context 共存 */
		if (this._state === EnumAutomationState.Locked)
		{
			await this._releaseContext();
		}

		const context = await this._newContext(options, true);

		try
		{
			await this._restoreStorageState(context);
			await this._lockContext(context);
		}
		catch (e)
		{
			/** 還原或通訊協議接線失敗時不留殘留的空 context */
			await closeContextSafely(context);
			throw e;
		}

		return context;
	}

	/** 取得目前主 context；尚無時建立一個 */
	async getContext(optionsContext?: BrowserContextOptions)
	{
		return this._context ?? await this.newContext(optionsContext);
	}

	/**
	 * 建立新分頁並納入追蹤
	 *
	 * @param options - 建立選項，可指定 background 模式（見 {@link ICreateNewPageOptions}）
	 * @returns 新建立的分頁
	 */
	async newPage(options?: ICreateNewPageOptions): Promise<Page>
	{
		const page = await createNewPage(this, options);

		this._bindPage(page);

		return page;
	}

	/**
	 * 導航至目標網址
	 *
	 * `page` 未提供時，依 `newPage` 決定建立新分頁或沿用主分頁；
	 * `checkMatch` 啟用且目前網址已等於目標網址時略過導航。
	 *
	 * @param url - 目標網址
	 * @param options - 導航選項；含 `newPage` 與 background 等分頁建立選項
	 * @returns 導航分頁與是否有發生 goto 行為
	 */
	async goto(url: string, options: IGotoOptions & ICreateNewPageOptions = {}): Promise<IGotoResult>
	{
		/** `page` 未提供時，由 `newPage` 決定建立新分頁或沿用主分頁 */
		const page = options.page ?? (options.newPage ? await this.newPage(options) : this.page);

		return gotoPage(page, url, options);
	}

	/** 強制以新分頁導航（等同 `goto` 且 `newPage: true`） */
	async gotoNewPage(url: string, options: IGotoOptions & ICreateNewPageOptions = {}): Promise<IGotoResult>
	{
		return this.goto(url, {
			...options,
			newPage: true,
		});
	}

	/** 關閉瀏覽器與所有 context，並清空全部追蹤狀態 */
	async close(): Promise<void>
	{
		const pages = this.pages;
		const context = this._context;
		const browser = this._browser;

		/** 同步清空追蹤狀態，關閉期間觸發的 close 事件才不會重複進入關閉流程 */
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

		const context = await this._newContext(options, true);

		return context;
	}

	/**
	 * 鎖定主 context
	 *
	 * 關閉所有非主 context、清除 `_pages` 內非主頁面、接線主 context 的所有頁面後，
	 * 以第一個追蹤頁面為主頁面，再切換至 {@link EnumAutomationState.Locked}，
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

			/**
			 * 清除 `_pages` 內非 primary 的殘留頁面
			 *
			 * 準備期的臨時 context 可能已接線過；其 context 雖已關閉，
			 * 若 close 事件未及時觸發，此處保證追蹤集合只保留主 context 的頁面。
			 */
			for (const page of this._pages)
			{
				if (page.context() !== primary)
				{
					this._pages.delete(page);
				}
			}

			this._context = primary;

			await this._bindContext(primary);

			/** 接線 primary 內所有尚未追蹤的頁面（已追蹤者跳過，避免重複掛載 close 監聽） */
			for (const page of primary.pages())
			{
				if (!this._pages.has(page))
				{
					this._bindPage(page);
				}
			}

			/**
			 * 鎖定後：以第一個追蹤的頁面為主頁面，否則由之後新開的頁面接任
			 *
			 * 清除主頁面引用，觸發 getter 重新計算主頁面
			 */
			this._page = null;
			void this.page;

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

		/** 主 context 關閉時釋放引用，避免持有已關閉的 context */
		context.on('close', () =>
		{
			if (this._context === context)
			{
				this._context = undefined;
			}
		});

		/** 掛載頁面通訊協定 (Bridge)，讓分頁可收發橋接命令 */
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
				/** 清除主頁面引用，觸發 getter 重新計算主頁面 */
				this._page = null;
				void this.page;
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
	pageLiveOn(page: ITSNullable<Page>, listener: IPageListener): void
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
