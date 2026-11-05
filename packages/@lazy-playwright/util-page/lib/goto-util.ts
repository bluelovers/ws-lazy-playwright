import type { Page } from 'playwright';
import type { ITSOverwrite } from 'ts-type';

/**
 * checkMatch 的物件形式
 *
 * 以 `href` 決定是否比對目前網址與目標網址。
 */
export interface IGotoCheckMatch
{
	/** 為 true 時比對目前網址與目標網址，相同則略過導航 */
	href?: boolean;
}

/**
 * @see Page.goto
 * @see https://playwright.dev/docs/api/class-page#page-goto
 */
export interface IPlaywrightGotoOptions extends Exclude<Parameters<Page['goto']>[1], null | undefined>
{
	/**
	 * Referer header value. If provided it will take preference over the referer header value set by
	 * [page.setExtraHTTPHeaders(headers)](https://playwright.dev/docs/api/class-page#page-set-extra-http-headers).
	 */
	referer?: string;

	/**
	 * Allows to cancel the operation using an
	 * [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). If the signal is aborted, the
	 * operation will be aborted and throw an error. Note that providing a signal does not disable the default timeout,
	 * which can be changed using
	 * [browserContext.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout)
	 * or [page.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-timeout); pass
	 * `timeout: 0` to disable the timeout entirely.
	 */
	signal?: AbortSignal;

	/**
	 * Maximum operation time in milliseconds. Defaults to `0` - no timeout. The default value can be changed via
	 * `navigationTimeout` option in the config, or by using the
	 * [browserContext.setDefaultNavigationTimeout(timeout)](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-navigation-timeout),
	 * [browserContext.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout),
	 * [page.setDefaultNavigationTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-navigation-timeout)
	 * or [page.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-timeout) methods.
	 */
	timeout?: number;

	/**
	 * When to consider operation succeeded, defaults to `load`. Events can be either:
	 * - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
	 * - `'load'` - consider operation to be finished when the `load` event is fired.
	 * - `'networkidle'` - **DISCOURAGED** consider operation to be finished when there are no network connections for
	 *   at least `500` ms. Don't use this method for testing, rely on web assertions to assess readiness instead.
	 * - `'commit'` - consider operation to be finished when network response is received and the document started
	 *   loading.
	 */
	waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

/**
 * `gotoOptions` 的輸入形式
 *
 * `referer` 允許以布林表達「沿用目前網址 / 不送出」，於正規化時收斂為字串或移除。
 */
export type IGotoOptionsInput = ITSOverwrite<IPlaywrightGotoOptions, {
	/** true 以目前網址作為 referer、false 移除該選項 */
	referer?: IPlaywrightGotoOptions['referer'] | boolean;
}>;

/**
 * goto 導航選項
 *
 * `page` 未提供時，由 `newPage` 決定分頁來源。
 */
export interface IGotoOptions
{
	/** 指定導航分頁；未提供時依 `newPage` 決定 */
	page?: Page;
	/** `page` 未提供時，true 建立新分頁、false 使用主分頁 */
	newPage?: boolean;
	/** true 或 `{ href: true }` 時比對目前網址，相同則略過導航 */
	checkMatch?: boolean | IGotoCheckMatch;
	/** Playwright 導航選項 */
	gotoOptions?: IGotoOptionsInput;
}

/** goto 導航結果 */
export interface IGotoResult
{
	/** 導航使用的分頁 */
	page: Page;
	/** 是否有發生 goto 行為 */
	didGoto: boolean;
}

export interface ICheckShouldGotoResult
{
	/** 目前網址是否已等於目標網址 */
	isSameUrl: boolean;
	/** 是否需要執行導航 */
	shouldGoto: boolean;
}

/**
 * 將 `checkMatch` 的布林 / 物件輸入正規化為物件形式
 *
 * @param checkMatch - 布林、物件或未提供
 * @returns 物件形式；`null` 以空物件替代
 */
export function _handleGotoOptionsCheckMatch(checkMatch?: boolean | IGotoCheckMatch): IGotoCheckMatch
{
	if (typeof checkMatch !== 'object')
	{
		/** 布林（含未提供）收斂為 `{ href }`，統一後續判斷入口 */
		checkMatch = { href: checkMatch };
	}

	/** `null` 的 typeof 亦為 `object`，依回傳契約以空物件替代 */
	return checkMatch ?? {};
}

/**
 * 正規化 `gotoOptions.referer` 的布林輸入後轉為 Playwright 導航選項
 *
 * `IPlaywrightGotoOptions.referer` 只接受字串，布林形式需在此收斂。
 *
 * @param runtime - 目前分頁網址，供 `referer: true` 沿用
 * @param gotoOptions - 使用者輸入的導航選項
 * @returns 可直接傳入 `page.goto` 的導航選項
 */
export function _handleGotoOptionsInput(runtime: {
	currentPageUrl: string;
}, gotoOptions?: IGotoOptionsInput): IPlaywrightGotoOptions
{
	if (typeof gotoOptions?.referer === 'boolean')
	{
		if (gotoOptions.referer)
		{
			/** 以目前網址作為 referer，保留來源脈絡 */
			gotoOptions.referer = runtime.currentPageUrl;
		}
		else
		{
			/** false 代表不送出 referer：移除後交由 Playwright 決定預設行為 */
			delete gotoOptions.referer;
		}
	}

	return gotoOptions as IPlaywrightGotoOptions;
}

/**
 * 判定是否需要執行導航
 *
 * 僅在啟用 `checkMatch` 且目前網址已等於目標網址時略過導航；
 * 未啟用 `checkMatch` 時一律導航（相同網址亦重新導航）。
 *
 * @param targetUrl - 目標網址
 * @param currentPageUrl - 目前網址
 * @param checkMatch - 是否比對目前網址與目標網址
 * @returns `isSameUrl` 目前網址是否已等於目標網址；`shouldGoto` 是否需要執行導航
 */
export function _checkShouldGotoUrl(targetUrl: string, currentPageUrl: string, checkMatch?: boolean | IGotoCheckMatch): ICheckShouldGotoResult
{
	const checkMatchOptions = _handleGotoOptionsCheckMatch(checkMatch);

	const isSameUrl = currentPageUrl === targetUrl;

	let shouldGoto = true;

	/** 已在目標網址時才需要判斷是否重複導航 */
	if (isSameUrl)
	{
		/** 僅在 checkMatch 啟用時才略過導航 */
		if (checkMatchOptions.href)
		{
			shouldGoto = false;
		}
	}

	return {
		/** 目前網址是否已等於目標網址 */
		isSameUrl,
		/** 是否需要執行導航 */
		shouldGoto,
	};
}

/**
 * 導航至目標網址
 *
 * `checkMatch` 為 true 或 `checkMatch.href` 為 true 時，
 * 比對目前網址與目標網址，相同則不執行導航；未啟用時一律導航。
 *
 * @param page - 導航分頁
 * @param url - 目標網址
 * @param options - 導航選項（分頁來源、`checkMatch` 與 Playwright 導航選項）
 * @returns 導航分頁與是否有發生 goto 行為
 */
export async function gotoPage(page: Page, url: string, options?: IGotoOptions): Promise<IGotoResult>
{
	const checkMatchOptions = _handleGotoOptionsCheckMatch(options?.checkMatch);

	const currentPageUrl = page.url();

	const { shouldGoto } = _checkShouldGotoUrl(url, currentPageUrl, checkMatchOptions);

	let didGoto = false;

	/** 略過導航時 `didGoto` 維持 false，僅回傳目前分頁 */
	if (!shouldGoto)
	{
		didGoto = false;
	}
	else
	{
		/** 收斂 `referer` 布林輸入後交由 Playwright 導航 */
		const gotoOptions = _handleGotoOptionsInput({ currentPageUrl }, options?.gotoOptions);

		await page.goto(url, gotoOptions);
		didGoto = true;
	}

	return { page, didGoto };
}
