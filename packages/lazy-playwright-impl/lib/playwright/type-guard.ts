import type { Page } from 'playwright';

/** Page 的結構子集，作為鴨子型別 (Duck Typing) 的判定依據 */
type I_PageLike = Pick<Page, 'context' | 'isClosed' | 'on' | 'url'>;

/**
 * 檢查值是否為 Page-like
 *
 * 以 `Page` 的關鍵方法判定，可過濾外部（如 JavaScript 呼叫端）傳入的非頁面值；
 * 僅驗證結構，不代表已通過 Playwright 的完整型別檢查。
 *
 * @param value - 任意待檢查的值
 * @returns 是否具備 `Page` 的關鍵成員
 */
export function isPageLike(value: unknown): value is Page
{
	if (typeof value !== 'object' || value === null)
	{
		return false;
	}

	const candidate = value as Partial<I_PageLike>;

	return typeof candidate.context === 'function'
		&& typeof candidate.isClosed === 'function'
		&& typeof candidate.on === 'function'
		&& typeof candidate.url === 'function';
}
