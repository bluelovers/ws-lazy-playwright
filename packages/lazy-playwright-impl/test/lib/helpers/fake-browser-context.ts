/// <reference types="node" />
import type { BrowserContext, Cookie } from 'playwright';
import type { IOriginState } from '@lazy-playwright/storage/lib/types';

/** 模擬瀏覽器 context：僅實作儲存流程會呼叫的成員 */
export interface IFakeBrowserContext
{
	/** 經由 `addCookies` 加入的 Cookie（供斷言轉移結果） */
	readonly addedCookies: readonly Cookie[];
	/** 經由 `addInitScript` 注入的腳本（供斷言 origin localStorage 還原） */
	readonly initScripts: readonly string[];
	/** 目前持有的 Cookie */
	cookies(): Promise<Cookie[]>;
	/** 目前的 storageState（Cookie + origins） */
	storageState(): Promise<{ cookies: Cookie[]; origins: IOriginState[] }>;
	/** 加入 Cookie */
	addCookies(cookies: readonly Cookie[]): Promise<void>;
	/** 注入 init script */
	addInitScript(script: string): Promise<void>;
}

/** 建立模擬 context；`cookies` 為初始 Cookie，`origins` 為 storageState 的 origins */
export function _createFakeBrowserContext(
	cookies: readonly Cookie[] = [],
	origins: readonly IOriginState[] = [],
): IFakeBrowserContext
{
	const current: Cookie[] = [...cookies];
	const addedCookies: Cookie[] = [];
	const initScripts: string[] = [];

	return {
		addedCookies,
		initScripts,
		async cookies()
		{
			return [...current];
		},
		async storageState()
		{
			return {
				cookies: [...current],
				origins: origins.map(origin => ({
					...origin,
					localStorage: [...(origin.localStorage ?? [])],
				})),
			};
		},
		async addCookies(incoming)
		{
			for (const cookie of incoming)
			{
				// 同 name + domain + path 覆寫，對齊 Playwright 的 Cookie 識別語意
				const index = current.findIndex(existing =>
					existing.name === cookie.name
					&& existing.domain === cookie.domain
					&& existing.path === cookie.path);

				if (index >= 0)
				{
					current[index] = cookie;
				}
				else
				{
					current.push(cookie);
				}

				addedCookies.push(cookie);
			}
		},
		async addInitScript(script)
		{
			initScripts.push(script);
		},
	};
}

/** 將模擬 context 以儲存流程要求的 `BrowserContext` 型別傳入 */
export function _asBrowserContext(context: IFakeBrowserContext): BrowserContext
{
	return context as unknown as BrowserContext;
}
