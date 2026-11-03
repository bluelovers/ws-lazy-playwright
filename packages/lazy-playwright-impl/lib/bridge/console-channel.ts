import type { ConsoleMessage } from 'playwright';
import { BRIDGE_CONSOLE_EVENT, BRIDGE_CONSOLE_PREFIX, DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME } from './const';
import type { IBridgeConsoleRequest, IBridgeResponse } from './types';

/** console 通道的回應；`id` 用於配對頁面端的掛起請求 */
export interface IBridgeConsoleResponse extends IBridgeResponse
{
	id: string;
}

/**
 * 解析 console 訊息為命令請求
 *
 * 僅接受 {@link BRIDGE_CONSOLE_PREFIX} 開頭且後續為合法 JSON 的訊息，
 * 其餘一般 console 輸出一律回傳 `undefined`，不會被誤判為命令。
 *
 * @param message - Playwright 的 console 訊息或其文字內容
 * @returns 合法的命令請求；非本通道訊息回傳 `undefined`
 */
export function parseBridgeConsoleMessage(message: ConsoleMessage | string): IBridgeConsoleRequest | undefined
{
	const text = typeof message === 'string' ? message : message.text();

	if (!text.startsWith(BRIDGE_CONSOLE_PREFIX))
	{
		return undefined;
	}

	try
	{
		const parsed: unknown = JSON.parse(text.slice(BRIDGE_CONSOLE_PREFIX.length));

		if (typeof parsed !== 'object' || parsed === null)
		{
			return undefined;
		}

		const { id, cmd, args } = parsed as Partial<IBridgeConsoleRequest>;

		if (typeof id !== 'string' || !id) return undefined;
		if (typeof cmd !== 'string' || !cmd) return undefined;

		return { id, cmd, args: Array.isArray(args) ? args : [] };
	}
	catch
	{
		return undefined;
	}
}

/**
 * 產生 console 通道的頁面端腳本
 *
 * 以字串形式產生是因為 `addInitScript` 只會序列化函式本身，
 * 無法保留閉包中的前綴、事件名稱與函式名稱（與 XHR 通道的 `buildBridgeClientScript` 同理）。
 *
 * 註冊 `window[globalName]`：透過 `console.log` 發送命令，
 * 並以 {@link BRIDGE_CONSOLE_EVENT} 接收 Node 端派發的回應以 resolve / reject。
 * 僅在 `exposeConsoleGlobal` 啟用時注入；純聽取模式不需要此腳本。
 *
 * @param globalName - 註冊於 window 上的便利函式名稱
 */
export function buildBridgeConsoleScript(globalName: string = DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME): string
{
	const prefix = JSON.stringify(BRIDGE_CONSOLE_PREFIX);
	const event = JSON.stringify(BRIDGE_CONSOLE_EVENT);
	const name = JSON.stringify(globalName);

	return `(() => {
	'use strict';
	const prefix = ${prefix};
	const event = ${event};
	const name = ${name};
	const pending = new Map();
	let seq = 0;

	window.addEventListener(event, (e) => {
		const detail = e.detail;
		const entry = detail && pending.get(detail.id);
		if (!entry) return;
		pending.delete(detail.id);
		if (detail.ok) { entry.resolve(detail.result); }
		else { entry.reject(new Error(detail.error || 'bridge console request failed')); }
	});

	const call = (cmd, args) => new Promise((resolve, reject) => {
		const id = String(++seq) + '-' + Date.now();
		pending.set(id, { resolve, reject });
		const list = Array.isArray(args) ? args : (args === undefined ? [] : [args]);
		console.log(prefix + JSON.stringify({ id, cmd: String(cmd == null ? '' : cmd), args: list }));
	});

	Object.defineProperty(window, name, {
		value: call,
		writable: true,
		configurable: true,
		enumerable: false,
	});
})();
`;
}
