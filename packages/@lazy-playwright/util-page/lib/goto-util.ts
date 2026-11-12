import type { Page } from 'playwright';
import type { ITSOverwrite } from 'ts-type';
import { createNewPage, ICreateNewPageOptions } from './open-new-util';
import { IBrowserCtxInput } from '@lazy-playwright/shared-types';

/**
 * checkMatch 的物件形式
 *
 * 以 `href` 決定是否比對目前網址與目標網址。
 */
export interface IGotoCheckMatch
{
	/** 為 true 時比對目前網址與目標網址，相同則略過導航 */
	href?: boolean;
	/**
	 * 判定完成、`_checkShouldGotoUrl` 回傳前的回呼（{@link IGotoCheckCallback}）：
	 * 接收目前判定結果與輸入參數，回傳非空時以之覆寫結果
	 * （如讀取頁面狀態後強制 / 取消導航，例如支援 `_readUploadCount`）
	 */
	callback?: IGotoCheckCallback;
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

	/** true 或 `{ href: true }` 時比對目前網址，相同則略過導航 */
	checkMatch?: boolean | IGotoCheckMatch;
	/** Playwright 導航選項 */
	gotoOptions?: IGotoOptionsInput;

	/** 確保分頁存在，若不存在則建立新分頁 */
	ensurePage?: boolean;

	/** `page` 未提供時，true 建立新分頁、false 使用主分頁 */
	newPage?: boolean;
	/** true 時 真具條件來決定是否建立新分頁 */
	newPageMaybe?: boolean;
	/** 建立新分頁時的選項 */
	newPageOptions?: ICreateNewPageOptions;
}

/** goto 導航結果 */
export interface IGotoResult extends Pick<ICheckShouldGotoResult, 'isSameUrl' | 'shouldGoto'>
{
	/** 導航使用的分頁 */
	page: Page;
	/** 是否有發生 goto 行為 */
	didGoto: boolean;
	/** 是否為新建立的分頁 */
	isNewPage: boolean;
	/** 分頁是否存在 */
	pageExists: boolean;
}

export interface ICheckShouldGotoResult
{
	/** 目前網址是否已等於目標網址 */
	isSameUrl: boolean;
	/** 是否需要執行導航 */
	shouldGoto: boolean;
	/** 是否需要新建立分頁 */
	shouldNewPage: boolean;
}

/** `IGotoCheckMatch.callback` 的回傳值：非空欄位覆寫判定結果的對應欄位 */
export type IGotoCheckCallbackResult = Partial<ICheckShouldGotoResult> | null | undefined;

/** `IGotoCheckMatch.callback` 的輸入參數：判定時的來源值 */
export interface IGotoCheckCallbackArgs
{
	/** 目標網址 */
	targetUrl: string;
	/** 目前網址 */
	currentPageUrl: string;
	/** 正規化後的比對選項 */
	checkMatch: IGotoCheckMatch;
	/** 原始選項 */
	options: IGotoOptions;
	/** 提供 context 與目前主分頁的瀏覽器實例 */
	ctx?: IBrowserCtxInput;
}

/**
 * `IGotoCheckMatch.callback`：於 `_checkShouldGotoUrl` 回傳前接收目前判定結果與輸入參數
 *
 * 回傳非空（至少含一個欄位）時以之覆寫對應欄位；
 * 回傳 `null` / `undefined` / `{}` 時沿用原判定。
 * 允許非同步回呼（可讀取頁面狀態，如 `_readUploadCount`）。
 */
export type IGotoCheckCallback = (
	result: ICheckShouldGotoResult,
	runtimeArgs: IGotoCheckCallbackArgs,
) => IGotoCheckCallbackResult | Promise<IGotoCheckCallbackResult>;

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
}, gotoOptions?: IGotoOptionsInput, ctx?: IBrowserCtxInput): IPlaywrightGotoOptions
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
 * `checkMatch.callback` 存在時，於回傳前接收目前判定結果與輸入參數（{@link IGotoCheckCallback}），
 * 回傳非空即以之覆寫結果（如讀取頁面狀態後強制 / 取消導航）。
 *
 * @param targetUrl - 目標網址
 * @param currentPageUrl - 目前網址
 * @param checkMatch - 是否比對目前網址與目標網址（含回呼 `callback`）
 * @returns Promise：`isSameUrl` 目前網址是否已等於目標網址；`shouldGoto` 是否需要執行導航
 */
export async function _checkShouldGotoUrl(targetUrl: string, currentPageUrl: string, checkMatch: boolean | IGotoCheckMatch, options: IGotoOptions, ctx?: IBrowserCtxInput): Promise<ICheckShouldGotoResult>
{
	const checkMatchOptions = _handleGotoOptionsCheckMatch(checkMatch);

	let result: ICheckShouldGotoResult = {
		/** 目前網址是否已等於目標網址 */
		isSameUrl: currentPageUrl === targetUrl,
		/** 是否需要執行導航 */
		shouldGoto: true,
		shouldNewPage: void 0,
	};

	/** 已在目標網址時才需要判斷是否重複導航 */
	if (result.isSameUrl)
	{
		/** 僅在 checkMatch 啟用時才略過導航 */
		if (checkMatchOptions.href)
		{
			result.shouldGoto = false;
		}
	}

	if (options.newPage)
	{
		result.shouldNewPage = options.newPage;
	}
	else if (options.newPageMaybe && result.shouldGoto)
	{
		result.shouldNewPage = options.newPageMaybe;
	}

	/** 回呼存在時：於回傳前接收目前結果與輸入參數，回傳非空即覆寫對應欄位 */
	const patched = await checkMatchOptions.callback?.(result, {
		targetUrl,
		currentPageUrl,
		checkMatch: checkMatchOptions,
		options,
		ctx,
	});

	if (patched && Object.keys(patched).length)
	{
		result = { ...result, ...patched };
	}

	return result;
}

/**
 * 導航至目標網址
 *
 * `checkMatch` 為 true 或 `checkMatch.href` 為 true 時，
 * 比對目前網址與目標網址，相同則不執行導航；未啟用時一律導航。
 * `checkMatch.callback` 存在時，於判定回傳前接收結果與參數，回傳非空即覆寫判定
 * （可非同步讀取頁面狀態，如 `_readUploadCount`）。
 *
 * @param page - 導航分頁
 * @param url - 目標網址
 * @param options - 導航選項（分頁來源、`checkMatch` 與 Playwright 導航選項）
 * @returns 導航分頁與是否有發生 goto 行為
 */
export async function gotoPage(page: Page, url: string, options?: IGotoOptions, ctx?: IBrowserCtxInput): Promise<IGotoResult>
{
	options ??= {};

	const checkMatchOptions = _handleGotoOptionsCheckMatch(options.checkMatch);

	const pageExists = page && !page.isClosed();

	let isNewPage: boolean;

	const _newPage = async () => {
		if (ctx)
		{
			page = await createNewPage(ctx, options.newPageOptions);
			isNewPage = true;
		}
		else
		{
			throw new Error('Cannot create new page without browser context');
		}
	}

	if (options.ensurePage && !pageExists || options.newPage)
	{
		await _newPage();
	}

	const currentPageUrl = page.url();

	let checkResult: ICheckShouldGotoResult;

	if (!isNewPage)
	{
		checkResult = await _checkShouldGotoUrl(url, currentPageUrl, checkMatchOptions, options, ctx);
	}

	let didGoto = false;

	/** 略過導航時 `didGoto` 維持 false，僅回傳目前分頁 */
	if (!checkResult?.shouldGoto && !isNewPage)
	{
		didGoto = false;
	}
	else
	{
		/** 收斂 `referer` 布林輸入後交由 Playwright 導航 */
		const gotoOptions = _handleGotoOptionsInput({ currentPageUrl }, options.gotoOptions);

		if (checkResult?.shouldNewPage && !isNewPage)
		{
			await _newPage();
		}

		await page.goto(url, gotoOptions);
		didGoto = true;
	}

	return {
		page,
		didGoto,
		isNewPage,

		pageExists,

		isSameUrl: checkResult?.isSameUrl,
		shouldGoto: checkResult?.shouldGoto,
		// shouldNewPage,
	};
}
