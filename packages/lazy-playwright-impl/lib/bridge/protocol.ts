import { BRIDGE_PARAM_ARGS, BRIDGE_PARAM_CMD, BRIDGE_PATH } from './const';
import type { IBridgeRequest, IBridgeResponse } from './types';

/**
 * 組出命令端點 URL
 *
 * 去除 base 尾端斜線後接上 {@link BRIDGE_PATH}，
 * 供 Node 端組路由與頁面端腳本共用同一份結果。
 */
export function buildBridgeEndpoint(fakeApiBase: string): string
{
	return `${fakeApiBase.replace(/\/+$/, '')}${BRIDGE_PATH}`;
}

/** 依 base 與請求組出完整的請求 URL */
export function buildBridgeUrl(fakeApiBase: string, request: IBridgeRequest): string
{
	const url = new URL(buildBridgeEndpoint(fakeApiBase));

	url.searchParams.set(BRIDGE_PARAM_CMD, request.cmd);
	url.searchParams.set(BRIDGE_PARAM_ARGS, JSON.stringify(request.args ?? []));

	return url.toString();
}

/**
 * 產生路由比對用的正規表示式
 *
 * 以正規表示式取代 glob：`/base/**` 需要斜線才會命中，
 * 無法攔截 `https://m9.test/__m9__` 這種結尾無斜線的網址。
 * 此處同時接受結尾為 `/`、`?` 或字串結束。
 */
export function buildBridgeRoutePattern(fakeApiBase: string): RegExp
{
	const base = fakeApiBase
		.replace(/\/+$/, '')
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	return new RegExp(`^${base}(?:[/?]|$)`);
}

/**
 * 解析請求 URL 為命令請求
 *
 * 缺少 `cmd` 或 `args` 非 JSON 陣列時回傳 `undefined`，由呼叫端決定錯誤回應。
 */
export function parseBridgeRequest(requestUrl: string): IBridgeRequest | undefined
{
	let url: URL;

	try
	{
		url = new URL(requestUrl);
	}
	catch
	{
		return undefined;
	}

	const cmd = url.searchParams.get(BRIDGE_PARAM_CMD);

	if (!cmd) return undefined;

	let args: readonly unknown[] = [];
	const raw = url.searchParams.get(BRIDGE_PARAM_ARGS);

	if (raw)
	{
		try
		{
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed))
			{
				args = parsed;
			}
		}
		catch
		{
			return undefined;
		}
	}

	return { cmd, args };
}

/** 序列化回應為 JSON 字串 */
export function serializeBridgeResponse(response: IBridgeResponse): string
{
	return JSON.stringify(response);
}

function _escapeHtml(value: string): string
{
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * 產生可直接導航查看的 HTML 回應頁
 *
 * 供除錯時在位址列直接輸入端點網址，以可讀方式顯示命令與結果。
 */
export function buildBridgeHtmlPage(
	request: IBridgeRequest | undefined,
	response: IBridgeResponse,
): string
{
	const cmd = _escapeHtml(request?.cmd ?? '(missing)');
	const args = _escapeHtml(JSON.stringify(request?.args ?? [], null, '\t'));
	const payload = _escapeHtml(JSON.stringify(response, null, '\t'));

	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Bridge</title></head>
<body>
<h1>Bridge</h1>
<p><strong>cmd:</strong> ${cmd}</p>
<p><strong>args:</strong></p>
<pre>${args}</pre>
<hr>
<pre>${payload}</pre>
</body>
</html>`;
}
