import { BRIDGE_PARAM_ARGS, BRIDGE_PARAM_CMD } from './const';
import { buildBridgeEndpoint } from './protocol';

/** 產生頁面端腳本所需的設定 */
export interface IBridgeClientScriptOptions
{
	fakeApiBase: string;
	globalName: string;
}

/**
 * 產生註冊於頁面端的呼叫腳本
 *
 * 以 XHR 發送請求並解析 `IBridgeResponse`，成功 resolve `result`、失敗 reject `error`。
 * 以字串形式產生是因為 `addInitScript` 只會序列化函式本身，
 * 無法保留閉包中的 `fakeApiBase` 與 `globalName`。
 */
export function buildBridgeClientScript(options: IBridgeClientScriptOptions): string
{
	const endpoint = JSON.stringify(buildBridgeEndpoint(options.fakeApiBase));
	const globalName = JSON.stringify(options.globalName);
	const paramCmd = JSON.stringify(BRIDGE_PARAM_CMD);
	const paramArgs = JSON.stringify(BRIDGE_PARAM_ARGS);

	return `(() => {
	'use strict';
	const endpoint = ${endpoint};
	const call = (cmd, args) => new Promise((resolve, reject) => {
		const list = Array.isArray(args) ? args : [args];
		const url = new URL(endpoint);
		url.searchParams.set(${paramCmd}, String(cmd == null ? '' : cmd));
		url.searchParams.set(${paramArgs}, JSON.stringify(list));
		const xhr = new XMLHttpRequest();
		xhr.open('GET', url.toString(), true);
		xhr.onload = () => {
			let data;
			try { data = JSON.parse(xhr.responseText); }
			catch (e) { resolve(xhr.responseText); return; }
			if (data && data.ok) { resolve(data.result); }
			else { reject(new Error((data && data.error) || 'bridge request failed')); }
		};
		xhr.onerror = () => reject(new Error('bridge request failed'));
		xhr.send();
	});
	const name = ${globalName};
	if (window[name] == null) {
		Object.defineProperty(window, name, {
			value: call,
			writable: true,
			configurable: true,
			enumerable: false,
		});
	}
})();
`;
}
