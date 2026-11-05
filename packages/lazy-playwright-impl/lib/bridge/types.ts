import type { BrowserContext, Page } from 'playwright';
import type { EnumAutomationEngine, EnumBrowserKind } from '../types/engine';
import type { IBrowserStorageManager } from '../storage/types';
import type { INullable } from '../types/types';
import { IBrowserCtx, IBrowserCtxInput } from '@lazy-playwright/shared-types';
import type { ITSRequiredWith } from 'ts-type';

/** 命令處理器的宿主 (Host)：由 `IBrowserAutomation` 實例傳入 */
export interface IBridgeCommandHost extends ITSRequiredWith<IBrowserCtx, 'context'>
{
	readonly engine: EnumAutomationEngine;
	readonly browserKind: EnumBrowserKind;
	readonly storage: IBrowserStorageManager;
}

/**
 * 命令處理器
 *
 * @param args - 解碼後的參數
 * @param page - 發出此次請求的頁面；`ctx.page` 則是主頁面，兩者不一定相同
 * @param ctx - 執行上下文
 * @param host - 命令宿主，提供儲存與引擎資訊
 */
export type IBridgeCommandHandler = (
	args: readonly unknown[],
	page: INullable<Page>,
	ctx: IBrowserCtxInput,
	host: IBridgeCommandHost,
) => unknown | Promise<unknown>;

/** 已解碼的通訊請求 */
export interface IBridgeRequest
{
	cmd: string;
	args: readonly unknown[];
}

/** 經由 console 訊息傳遞的命令請求；`id` 用於配對回應 */
export interface IBridgeConsoleRequest extends IBridgeRequest
{
	id: string;
}

/** 通訊回應：頁面端據 `ok` 決定 resolve 或 reject */
export interface IBridgeResponse
{
	ok: boolean;
	result?: unknown;
	error?: string;
}

/** 通訊協議設定 */
export interface IBridgeOptions
{
	/** 偽造 API 的 base URL，預設 `DEFAULT_FAKE_API_BASE` */
	fakeApiBase?: string;
	/** 是否註冊 window 上的便利函式，預設 `false`（不註冊） */
	exposeGlobal?: boolean;
	/** 便利函式名稱，預設 `DEFAULT_BRIDGE_GLOBAL_NAME` */
	globalName?: string;
	/**
	 * 是否啟用 console 訊息通道（由頁面 console 偵測命令），預設 `false`
	 *
	 * 純 Node 端聽取，屬非侵入式：不會注入任何腳本。
	 */
	useConsole?: boolean;
	/**
	 * 是否經由 `addInitScript` 注入 console 通道的頁面端便利函式，預設 `false`
	 *
	 * 需先啟用 `useConsole`；僅注入腳本供頁面呼叫，不影響聽取行為。
	 */
	exposeConsoleGlobal?: boolean;
	/** console 通道便利函式名稱，預設 `DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME` */
	consoleGlobalName?: string;
}

/** 通訊協議介面：註冊任意命令並接線至 context */
export interface IBrowserBridge
{
	readonly fakeApiBase: string;
	readonly globalName: string;
	readonly exposeGlobal: boolean;
	/** 是否啟用 console 訊息通道（非侵入式，不注入腳本） */
	readonly useConsole: boolean;
	/** 是否注入 console 通道的頁面端便利函式 */
	readonly exposeConsoleGlobal: boolean;
	/** console 通道便利函式名稱 */
	readonly consoleGlobalName: string;

	/** 已註冊的命令名稱 */
	readonly commands: readonly string[];

	/** 註冊命令，重複名稱會覆寫 */
	register(name: string, handler: IBridgeCommandHandler): this;
	/** 批次註冊命令 */
	registerAll(commands: Record<string, IBridgeCommandHandler>): this;
	has(name: string): boolean;
	unregister(name: string): boolean;

	/** 於 context 上接線；重複呼叫同一 context 不會重複註冊 */
	install(context: BrowserContext): Promise<void>;
}
