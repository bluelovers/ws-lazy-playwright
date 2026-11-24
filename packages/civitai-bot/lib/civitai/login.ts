import type { Page } from 'playwright';

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
 * 回傳的 {@link ILoginState.source} 記錄實際命中的條件：
 * `'none'` 代表頁面尚未載入、`loggedIn` 不可信，呼叫端應重試。
 *
 * @param page 目前頁面
 */
export async function checkLogin(page: Page): Promise<ILoginState>
{
	return page.evaluate(({ ACCOUNT_MENU_SELECTOR, SIGN_IN_SELECTOR, EnumLoginSource }): ILoginState =>
	{
		/** 由 `#__NEXT_DATA__` 取得 session：伺服器注入，與樣式無關 */
		const readSession = (): { found: boolean; username: string | null; } =>
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
		};

		const session = readSession();

		if (session.found)
		{
			return { loggedIn: session.username !== null, username: session.username, source: EnumLoginSource.NextData };
		}

		/** DOM 備援：帳號選單按鈕 = 已登入 */
		if (document.querySelector(ACCOUNT_MENU_SELECTOR))
		{
			/** 使用者名稱備援：頭像佔位 `title="<username>'s Avatar"` */
			const title = document.querySelector(`${ACCOUNT_MENU_SELECTOR} [title]`)?.getAttribute('title') ?? '';
			const username = /^(.+)'s Avatar$/.exec(title)?.[1] ?? null;

			return { loggedIn: true, username, source: EnumLoginSource.AccountMenu };
		}

		/** DOM 備援：Sign In 連結 = 未登入 */
		if (document.querySelector(SIGN_IN_SELECTOR))
		{
			return { loggedIn: false, username: null, source: EnumLoginSource.SignIn };
		}

		/** 兩種特徵皆未出現（頁面未載入）：`loggedIn` 不可信，由呼叫端負責重試 */
		return { loggedIn: false, username: null, source: EnumLoginSource.None };
	}, {
		ACCOUNT_MENU_SELECTOR,
		SIGN_IN_SELECTOR,
		/** enum 無法於瀏覽器端作用域取得：以參數傳入，回傳值即 enum 成員值 */
		EnumLoginSource,
	});
}
