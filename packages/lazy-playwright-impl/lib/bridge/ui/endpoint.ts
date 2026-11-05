import { _escapeHtml } from '../protocol';
import type { IBridgeRequest, IBridgeResponse } from '../types';


/**
 * 產生可直接導航查看的 HTML 回應頁
 *
 * 供除錯時在位址列直接輸入端點網址，以可讀方式顯示命令與結果。
 */
export function buildBridgeHtmlPage(
	request: IBridgeRequest | undefined,
	response: IBridgeResponse
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
