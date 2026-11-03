/**
 * 預設偽造 API 的 base URL
 *
 * `.test` 網域由 RFC 6761 保留，永不指向真實站台；
 * 即使離開 `page.route` 攔截範圍也不會打到任何真實服務。
 * 網域名稱短且易於手動輸入。
 */
export const DEFAULT_FAKE_API_BASE = 'https://m9.test/__m9__';

/** 預設的 window 便利函式名稱：好記且不會與常見函式衝突 */
export const DEFAULT_BRIDGE_GLOBAL_NAME = '__m9_scrape';

/** 命令名稱的 query 參數 */
export const BRIDGE_PARAM_CMD = 'cmd';

/** 參數陣列的 query 參數（JSON 編碼） */
export const BRIDGE_PARAM_ARGS = 'args';

/** 命令端點的路徑 */
export const BRIDGE_PATH = '/call';

/** console 通道的請求訊息前綴：用於從頁面 console 訊息中辨識命令 */
export const BRIDGE_CONSOLE_PREFIX = '[m9]';

/** console 通道回應派發的 window 事件名稱 */
export const BRIDGE_CONSOLE_EVENT = 'm9:bridge';

/** console 通道頁面端便利函式名稱（與 XHR 通道的 {@link DEFAULT_BRIDGE_GLOBAL_NAME} 獨立） */
export const DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME = '__m9_console';

/** 跨來源請求所需的回應標頭 */
export const BRIDGE_CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': '*',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Max-Age': '86400',
};
