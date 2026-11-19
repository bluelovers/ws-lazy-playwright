import {
	createStorageReport,
	diffStorageReport,
	formatStorageReport,
	formatStorageReportDiff,
	readStorageReport,
} from '../storage';
import { DEFAULT_STORAGE_ID, EnumStorageKind } from '../storage/types';
import type { IBridgeCommandHandler } from './types';

/** 取得儲存 id：第一個字串參數，否則使用預設值 */
function _resolveStorageId(args: readonly unknown[]): string
{
	const [id] = args;
	return typeof id === 'string' && id ? id : DEFAULT_STORAGE_ID;
}

/**
 * 建立內建預設命令
 *
 * - `echo`：回傳簡易且不含隱私的資訊（引擎、瀏覽器類型）
 * - `saveSession`：儲存 ctx.context 的 storageState，並回傳更改前後數量差異報告
 * - `saveCookies`：儲存 ctx.context 的 Cookie，並回傳更改前後數量差異報告
 * - `reportSession`：回傳已儲存 Session 的網域分組數量報告
 * - `reportCookies`：回傳已儲存 Cookie 的網域分組數量報告
 *
 * 儲存類命令皆另附 `cli` 欄位，為對應報告的人類可讀 CLI 文字輸出。
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
			const before = await readStorageReport(host.storage.persist, EnumStorageKind.Session, id);
			const record = await host.storage.sessions.save(id, ctx.context);
			const report = diffStorageReport(before, createStorageReport(record));

			return {
				id,
				kind: EnumStorageKind.Session,
				cookies: record.payload.cookies.length,
				origins: record.payload.origins.length,
				report,
				cli: formatStorageReportDiff(report),
			};
		},

		saveCookies: async (args, _page, ctx, host) =>
		{
			const id = _resolveStorageId(args);
			const before = await readStorageReport(host.storage.persist, EnumStorageKind.Cookie, id);
			const record = await host.storage.cookies.save(id, ctx.context);
			const report = diffStorageReport(before, createStorageReport(record));

			return {
				id,
				kind: EnumStorageKind.Cookie,
				cookies: record.payload.length,
				report,
				cli: formatStorageReportDiff(report),
			};
		},

		reportSession: async (args, _page, _ctx, host) =>
		{
			const id = _resolveStorageId(args);
			const report = await readStorageReport(host.storage.persist, EnumStorageKind.Session, id);

			return {
				id,
				kind: EnumStorageKind.Session,
				report: report ?? null,
				cli: report ? formatStorageReport(report) : `[${EnumStorageKind.Session}] ${id}: not found`,
			};
		},

		reportCookies: async (args, _page, _ctx, host) =>
		{
			const id = _resolveStorageId(args);
			const report = await readStorageReport(host.storage.persist, EnumStorageKind.Cookie, id);

			return {
				id,
				kind: EnumStorageKind.Cookie,
				report: report ?? null,
				cli: report ? formatStorageReport(report) : `[${EnumStorageKind.Cookie}] ${id}: not found`,
			};
		},
	};
}
