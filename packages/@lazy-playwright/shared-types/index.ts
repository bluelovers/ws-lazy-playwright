

import type { BrowserContext, Page, Browser } from 'playwright';
import type { ITSRequireAtLeastOne } from 'ts-type';

/** 命令執行時的上下文 (Context)；`IBrowserAutomation` 亦繼承此介面 */
export interface IBrowserCtx
{
	/** 瀏覽器 / Browser */
	browser?: Browser;
	/** 瀏覽器上下文 / Browser context */
	context?: BrowserContext;
	/** 主頁面 (Main Page)；可能與發出請求的頁面不同 */
	page?: Page;
}

/** 至少包含一個屬性的瀏覽器上下文輸入 */
export type IBrowserCtxInput = ITSRequireAtLeastOne<IBrowserCtx>;
