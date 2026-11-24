import type { Page } from 'playwright';
import { EnumPostPhase } from '../types/types';
import { _logPhase } from '../util/logger';

/** 帳號選單按鈕：`aria-label` 為穩定無障礙屬性，不受 CSS class hash 變動影響 */
const ACCOUNT_MENU_SELECTOR = 'button[aria-label="Account menu"]';

/** 登入連結：`href` 前綴與可見文字為穩定語意，class 為 build hash 會變動 */
const SIGN_IN_SELECTOR = 'a[href^="/login"]';

/** 判斷來源：本次登入狀態由哪個條件得出 */
export enum EnumLoginSource
{
	/** `#__NEXT_DATA__` 的 `session.user` 資料（首選，與 CSS 無關） */
	NextData = 'next-data',
	/** 帳號選單按鈕 `button[aria-label="Account menu"]` 存在 */
	AccountMenu = 'account-menu',
	/** Sign In 連結 `a[href^="/login"]` 存在 */
	SignIn = 'sign-in',
	/** 皆未出現（頁面尚未載入），`loggedIn` 不可信 */
	None = 'none',
}

/** 登入狀態快照 */
export interface ILoginState
{
	/** 是否已登入 */
	loggedIn: boolean;
	/** 使用者名稱；未登入或無法取得時為 `null` */
	username: string | null;
	/** 本次判定實際命中的條件（{@link EnumLoginSource}） */
	source: EnumLoginSource;
}

/**
 * 讀取登入狀態（穩定判定，不受 CSS class hash 變動影響）
 *
 * 判定來源依優先序：
 *
 * 1. **`#__NEXT_DATA__`（首選，完全不依賴 CSS）** —
 *    `props.pageProps.session.user.username` 為伺服器注入的 session 資料，
 *    `session` 為 `null` / 缺失即未登入。
 * 2. **DOM 備援** — 已登入：`button[aria-label="Account menu"]` 存在；
 *    未登入：`a[href^="/login"]`（Sign In）存在。
 *    使用者名稱再由帳號選單內頭像佔位的 `title`（`<username>'s Avatar`）擷取。
 *
 * 回傳的 {@link ILoginState['source']} 記錄實際命中的條件：
 * `'none'` 代表頁面尚未載入、`loggedIn` 不可信，呼叫端應重試。
 *
 * @param page 目前頁面
 */
export async function checkLogin(page: Page): Promise<ILoginState>
{
	return page.evaluate(({ accontMenuSelector, signInSelector, source }): ILoginState =>
	{
		/** 由 `#__NEXT_DATA__` 取得 session：伺服器注入，與樣式無關 */
		const session = ((): { found: boolean; username: string | null; } =>
		{
			const data = document.getElementById('__NEXT_DATA__');

			if (!data?.textContent) return { found: false, username: null };

			try
			{
				const pageProps = JSON.parse(data.textContent)?.props?.pageProps;
				const user = pageProps?.session?.user;

				if (user && typeof user.username === 'string')
				{
					return { found: true, username: user.username };
				}

				/** `pageProps` 存在但無 session.user：明確的未登入 */
				return { found: true, username: null };
			}
			catch
			{
				return { found: false, username: null };
			}
		})();

		if (session.found)
		{
			return { loggedIn: session.username !== null, username: session.username, source: source.NextData };
		}

		/** DOM 備援：帳號選單按鈕 = 已登入 */
		if (document.querySelector(accontMenuSelector))
		{
			/** 使用者名稱備援：頭像佔位 `title="<username>'s Avatar"` */
			const title = document.querySelector(`${accontMenuSelector} [title]`)?.getAttribute('title') ?? '';
			const username = /^(.+)'s Avatar$/.exec(title)?.[1] ?? null;

			return { loggedIn: true, username, source: source.AccountMenu };
		}

		/** DOM 備援：Sign In 連結 = 未登入 */
		if (document.querySelector(signInSelector))
		{
			return { loggedIn: false, username: null, source: source.SignIn };
		}

		/** 兩種特徵皆未出現（頁面未載入）：`loggedIn` 不可信，由呼叫端負責重試 */
		return { loggedIn: false, username: null, source: source.None };
	}, {
		accontMenuSelector: ACCOUNT_MENU_SELECTOR,
		signInSelector: SIGN_IN_SELECTOR,
		/** enum 無法於瀏覽器端作用域取得：以參數傳入，回傳值即 enum 成員值 */
		source: {
			...EnumLoginSource,
		},
	});
}

/** 等待登入狀態判定的預設逾時（ms）：涵蓋頁面載入與 hydration 完成 */
export const LOGIN_WAIT_TIMEOUT = 30_000;

/** 狀態輪詢間隔（ms）：尚未達成期望狀態時重試 */
const LOGIN_POLL_MS = 5_000;

/** {@link waitForLogin} 選項（第二參數起一律以物件傳入） */
export interface IWaitForLoginOptions
{
	/** 等待逾時（ms；預設 {@link LOGIN_WAIT_TIMEOUT}） */
	timeout?: number;

	/** 輪詢間隔（ms；預設 {@link LOGIN_POLL_MS}） */
	polling?: number;
	/**
	 * `true`：持續等待直至**已登入**（`loggedIn` 為 `true` 且回傳快照可信）；
	 * 未登入（`SignIn`）不算達成，持續輪詢至逾時。
	 * `false`（預設）：狀態可判定（`source !== None`）即回傳。
	 */
	untilLoggedIn?: boolean;
}

/**
 * 等待登入狀態可判定，或持續等待至已登入（輪詢 {@link checkLogin}）
 *
 * `source === None` 代表頁面尚未載入、結果不可信，故以輪詢取代單次讀取：
 *
 * - 預設（`untilLoggedIn: false`）：取得任一明確條件
 *   （`NextData` / `AccountMenu` / `SignIn`）立即回傳，
 *   呼叫端依 {@link ILoginState['loggedIn']} 決定後續動作。
 * - `untilLoggedIn: true`：僅 `loggedIn` 為 `true` 才回傳；
 *   明確的未登入（`SignIn`）或不可判定（`None`）皆繼續輪詢。
 *
 * 逾時回傳最後一次快照，**不拋錯**：
 *
 * - 預設模式：`source` 為 `None`、`loggedIn: false`，**不代表未登入**
 * - `untilLoggedIn` 模式：最後快照可能為明確的未登入（`source: SignIn`）
 *
 * 呼叫端須檢查 {@link ILoginState['source']} 區分「未登入」與「未載入完成」。
 *
 * @param page 目前頁面（應已完成導航）
 * @param options 選項（{@link IWaitForLoginOptions}；省略時以預設值執行）
 */
export async function waitForLogin(page: Page, options: IWaitForLoginOptions = {}): Promise<ILoginState>
{
	let { timeout = LOGIN_WAIT_TIMEOUT, polling = LOGIN_POLL_MS, untilLoggedIn = false } = options;

	if (polling <= 0)
	{
		polling = LOGIN_POLL_MS;
	}

	if (timeout === -1)
	{
		/** set to 30 minutes */
		timeout = Date.now() + 30 * 60 * 1000;
	}
	else if (timeout <= 0)
	{
		timeout = LOGIN_WAIT_TIMEOUT;
	}

	const deadline = Date.now() + timeout;

	_logPhase(EnumPostPhase.AutoPost, undefined, `waiting for login...`, ['debug']);

	for (;;)
	{
		const state = await checkLogin(page);

		/** 達成期望狀態：可判定即回傳；`untilLoggedIn` 時須已登入 */
		if (state.source !== EnumLoginSource.None && (!untilLoggedIn || state.loggedIn))
		{
			_logPhase(EnumPostPhase.AutoPost, undefined, `login detected: ${state.source}, username: ${state.username}`, ['success']);

			return state;
		}

		if (Date.now() >= deadline)
		{
			_logPhase(EnumPostPhase.AutoPost, undefined, `login timeout`, ['error']);

			return state;
		}

		_logPhase(EnumPostPhase.AutoPost, { verbose: true }, `waiting for login...`, ['warn']);

		await page.waitForTimeout(polling);
	}
}
