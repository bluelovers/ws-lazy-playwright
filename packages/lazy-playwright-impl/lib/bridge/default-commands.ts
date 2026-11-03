import type { BrowserContext, Page } from 'playwright';
import type { EnumAutomationEngine, EnumBrowserKind } from '../engine';
import { EnumStorageKind, type IBrowserStorageManager } from '../storage/types';
import type { INullable } from '../types';
import type { IBridgeCommandHandler } from './types';

/** 預設命令未指定 id 時使用的儲存識別 */
export const DEFAULT_BRIDGE_STORAGE_ID = 'default';

/** 內建預設命令所需的宿主能力 */
export interface IBridgeCommandHost
{
	readonly engine: EnumAutomationEngine;
	readonly browserKind: EnumBrowserKind;
	readonly storage: IBrowserStorageManager;
	readonly context: INullable<BrowserContext>;
}

/** 取得命令的目標 context：優先使用請求來源分頁所屬的 context */
function _resolveContext(host: IBridgeCommandHost, page: INullable<Page>): BrowserContext
{
	const context = page?.context() ?? host.context;

	if (!context)
	{
		throw new Error('bridge: no active browser context');
	}

	return context;
}

/** 取得儲存 id：第一個字串參數，否則使用預設值 */
function _resolveStorageId(args: readonly unknown[]): string
{
	const [id] = args;
	return typeof id === 'string' && id ? id : DEFAULT_BRIDGE_STORAGE_ID;
}

/**
 * 建立內建預設命令
 *
 * - `echo`：回傳簡易且不含隱私的資訊（引擎、瀏覽器類型）
 * - `saveSession`：儲存目前 context 的 storageState
 * - `saveCookies`：儲存目前 context 的 Cookie
 *
 * 儲存範圍為實例目前唯一的 context，而非整個瀏覽器；
 * 結果一律回傳筆數，讓「存到 0 筆」與「寫入失敗」可被區分。
 * 所有 handler 於呼叫時才讀取 `host.engine`，避免抽象屬性尚未初始化。
 */
export function createDefaultBridgeCommands(host: IBridgeCommandHost): Record<string, IBridgeCommandHandler>
{
	return {
		echo: (args) => ({
			message: args.length ? args.join(' ') : 'hello',
			engine: host.engine,
			browser: host.browserKind,
		}),

		saveSession: async (args, page) =>
		{
			const context = _resolveContext(host, page);
			const id = _resolveStorageId(args);

			const record = await host.storage.sessions.save(id, context);

			return {
				id,
				kind: EnumStorageKind.Session,
				cookies: record.payload.cookies.length,
				origins: record.payload.origins.length,
			};
		},

		saveCookies: async (args, page) =>
		{
			const context = _resolveContext(host, page);
			const id = _resolveStorageId(args);

			const record = await host.storage.cookies.save(id, context);

			return {
				id,
				kind: EnumStorageKind.Cookie,
				cookies: record.payload.length,
			};
		},
	};
}
