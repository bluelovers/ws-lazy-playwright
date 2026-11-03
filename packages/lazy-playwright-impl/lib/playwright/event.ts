import type { BrowserContext, Page } from 'playwright';
import type { INullable, IPageListener } from '../types';

/**
 * 監聽 context 新增的分頁
 *
 * 若 `page` 已存在則先執行一次 `listener`，之後每次 context 產生新分頁 (Popup / Target)
 * 都會再呼叫 `listener`。
 *
 * 這是單次接線的底層函式；若需跨 context 重建仍保留監聽，
 * 請改用 `IBrowserAutomation.pageLiveOn`。
 *
 * @param ctx - 具備 `context` 的物件，例如 `IBrowserAutomation` 實例
 * @param page - 起始分頁，可為 `null`
 * @param listener - 分頁建立時的處理器
 *
 * @example
 * pageLiveOn(automation, automation.context?.pages()[0], (page) => {
 * 	setupMonitor(page);
 * });
 */
export function pageLiveOn(
	ctx: { readonly context: INullable<BrowserContext> },
	page: INullable<Page>,
	listener: IPageListener,
): void
{
	page && listener(page);
	ctx.context?.on('page', listener);
}
