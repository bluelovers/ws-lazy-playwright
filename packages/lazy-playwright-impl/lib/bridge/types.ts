import type { BrowserContext, Page } from 'playwright';
import type { INullable } from '../types';

/** 命令處理器：接收解碼後的參數與來源分頁，回傳值即為頁面端拿到的 result */
export type IBridgeCommandHandler = (
	args: readonly unknown[],
	page: INullable<Page>,
) => unknown | Promise<unknown>;

/** 已解碼的通訊請求 */
export interface IBridgeRequest
{
	cmd: string;
	args: readonly unknown[];
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
}

/** 通訊協議介面：註冊任意命令並接線至 context */
export interface IBrowserBridge
{
	readonly fakeApiBase: string;
	readonly globalName: string;
	readonly exposeGlobal: boolean;

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
