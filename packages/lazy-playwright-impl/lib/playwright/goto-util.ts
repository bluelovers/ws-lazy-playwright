import type { Page } from 'playwright';

/**
 * checkExists 的物件形式
 *
 * 以 `href` 決定是否比對目前網址與目標網址。
 */
export interface IGotoCheckExists
{
	/** 為 true 時比對目前網址與目標網址，相同則略過導航 */
	href?: boolean;
}

/**
 * @see Page.goto
 * @see https://playwright.dev/docs/api/class-page#page-goto
 */
export interface IPlaywrightGotoOptions
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
	checkExists?: boolean | IGotoCheckExists;
	/** Playwright 導航選項 */
	gotoOptions?: IPlaywrightGotoOptions & {
		/** 是否使用 referer */
		referer?: boolean;
	};
}

/** goto 導航結果 */
export interface IGotoResult
{
	/** 導航使用的分頁 */
	page: Page;
	/** 是否有發生 goto 行為 */
	didGoto: boolean;
}

export function _handleGotoOptionsCheckExists(checkExists?: boolean | IGotoCheckExists): IGotoCheckExists
{
	if (typeof checkExists !== 'object')
	{
		checkExists = { href: checkExists };
	}

	return checkExists ?? {};
}

export function _checkShouldGotoUrl(targetUrl: string, currentPageUrl: string, checkExists?: boolean | IGotoCheckExists)
{
	const checkExistsObj = _handleGotoOptionsCheckExists(checkExists);

	const isSameUrl = currentPageUrl === targetUrl;

	let shouldGoto = true;

	/** 已在目標網址時不重複導航 */
	if (!isSameUrl)
	{
		/** 檢查是否需要導航 */
		if (checkExistsObj.href)
		{
			shouldGoto = false;
		}
	}

	return {
		isSameUrl,
		shouldGoto,
	};
}

/**
 * 導航至目標網址，已在目標網址時略過導航
*
 * `checkExists` 為 true 或 `checkExists.href` 為 true 時，
 * 比對 `page.url()` 與目標網址，相同則不執行導航。
 *
 * @param page - 導航分頁
 * @param url - 目標網址
 * @param checkExists - 是否比對目前網址與目標網址
 * @returns 導航分頁與是否有發生 goto 行為
 */
export async function gotoPage(page: Page, url: string, options?: IGotoOptions): Promise<IGotoResult>
{
	const checkExistsObj = _handleGotoOptionsCheckExists(options?.checkExists);

	const currentPageUrl = page.url();

	const { shouldGoto } = _checkShouldGotoUrl(url, currentPageUrl, checkExistsObj);

	let didGoto = false;

	/** 已在目標網址時不重複導航 */
	if (!shouldGoto)
	{
		didGoto = false;
	}
	else
	{
		if (typeof options?.gotoOptions?.referer === 'boolean')
		{
			if (options.gotoOptions.referer)
			{
				// @ts-ignore
				options.gotoOptions.referer = currentPageUrl;
			}
			else
			{
				delete options.gotoOptions.referer;
			}
		}

		await page.goto(url, options?.gotoOptions as IPlaywrightGotoOptions);
		didGoto = true;
	}

	return { page, didGoto };
}
