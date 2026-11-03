import { EnumStorageKind } from '../storage/types';
import type { IBridgeCommandHandler } from './types';

/** 預設命令未指定 id 時使用的儲存識別 */
export const DEFAULT_BRIDGE_STORAGE_ID = 'default';

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
 * - `saveSession`：儲存 ctx.context 的 storageState
 * - `saveCookies`：儲存 ctx.context 的 Cookie
 *
 * 儲存範圍為指令執行上下文所屬的 context；結果一律回傳筆數，
 * 讓「存到 0 筆」與「寫入失敗」可被區分。
 * 宿主資訊統一由第四參數 `host` 提供，避免與閉包重複。
 */
export function createDefaultBridgeCommands(): Record<string, IBridgeCommandHandler>
{
	return {
		echo: (args, _page, _ctx, host) => ({
			message: args.length ? args.join(' ') : 'hello',
			engine: host.engine,
			browser: host.browserKind,
		}),

		saveSession: async (args, _page, ctx, host) =>
		{
			const id = _resolveStorageId(args);
			const record = await host.storage.sessions.save(id, ctx.context);

			return {
				id,
				kind: EnumStorageKind.Session,
				cookies: record.payload.cookies.length,
				origins: record.payload.origins.length,
			};
		},

		saveCookies: async (args, _page, ctx, host) =>
		{
			const id = _resolveStorageId(args);
			const record = await host.storage.cookies.save(id, ctx.context);

			return {
				id,
				kind: EnumStorageKind.Cookie,
				cookies: record.payload.length,
			};
		},
	};
}
