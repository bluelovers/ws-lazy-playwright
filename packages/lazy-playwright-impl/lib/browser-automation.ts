import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { DEFAULT_BROWSER_KIND, type EnumAutomationEngine, type EnumBrowserKind } from './engine';
import { closeBrowserSafely } from './playwright/browser-util';
import { BrowserStorageManager } from './storage';
import type {
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
		page.on('close', () => this._pages.delete(page));
	}
}
