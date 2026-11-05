import { IBrowserCtx } from '@lazy-playwright/shared-types';

/**
 * 建立新分頁的選項
 */
export interface ICreateNewPageOptions
{
	/** true 時新分頁不搶佔前景：將原主分頁 (Main Page) 拉回前景 */
	background?: boolean;
	/** 僅在 background 為 true 時生效：是否等待主分頁回到前景後才回傳 */
	waitForBringToFront?: boolean;
}

/**
 * 以 `ctx` 的 context 建立新分頁
 *
 * `background` 啟用時不改變使用者目前可見的分頁：
 * 新分頁建立後將原主分頁 `bringToFront` 拉回前景。
 *
 * @param ctx - 提供 context 與目前主分頁的瀏覽器實例
 * @param options - 建立選項
 * @returns 建立的新分頁
 */
export async function createNewPage(ctx: IBrowserCtx, options?: ICreateNewPageOptions)
{
	let page = await ctx.context.newPage();

	/**
	 * background 模式且新分頁非主分頁時才需還原前景：
	 * 新分頁建立時會自動置前，故將原主分頁拉回以維持使用者視野；
	 * 新分頁即目前主分頁時無需還原。
	 */
	if (options?.background && page !== ctx.page)
	{
		const p = ctx.page?.bringToFront();

		/** 依 waitForBringToFront 決定是否等待前景切換完成 */
		if (options?.waitForBringToFront)
		{
			await p;
		}
	}

	return page;
}
