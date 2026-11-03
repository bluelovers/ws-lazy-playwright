import type { Browser, BrowserContext, Page } from 'playwright';
import type { INullable } from '../types';

/**
 * 安全關閉 page → context → browser
 *
 * 以 `Promise.allSettled` 併行關閉，單一項目失敗不影響其他項目，
 * 避免殘留背景程序。
 */
export async function closeBrowserSafely(target: {
	pages?: readonly INullable<Page>[];
	contexts?: readonly INullable<BrowserContext>[];
	browser?: INullable<Browser>;
}): Promise<void>
{
	await Promise.allSettled([
		Promise.allSettled((target.pages ?? []).map(closePageSafely)),
		Promise.allSettled((target.contexts ?? []).map(closeContextSafely)),
		closeContextSafely(target.browser),
	]);
}

/** 關閉單一 page；已關閉或不存在時直接略過 */
export async function closePageSafely(page: INullable<Page>): Promise<void>
{
	if (!page || page.isClosed()) return;
	await page.close().catch(() => {});
}

/** 關閉 context 或 browser；不存在時直接略過 */
export async function closeContextSafely(context: INullable<BrowserContext | Browser>): Promise<void>
{
	await context?.close().catch(() => {});
}
