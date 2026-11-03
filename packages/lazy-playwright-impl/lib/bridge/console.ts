import { buildBridgeEndpoint } from './protocol';

/**
 * 產生可互動的 API 控制台頁面
 *
 * 列出所有已註冊的指令供直接選取，編輯參數後執行並顯示結果。
 * 頁面本身由偽造 API 端點供應，對端點的 `fetch` 屬同源請求。
 *
 * @param fakeApiBase - 偽造 API 的 base URL
 * @param commands - 已註冊的指令名稱
 */
export function buildBridgeConsolePage(fakeApiBase: string, commands: readonly string[]): string
{
	const endpoint = JSON.stringify(buildBridgeEndpoint(fakeApiBase));
	const names = JSON.stringify(commands);

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bridge Console</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 48rem; }
label { display: block; margin-top: 1rem; font-weight: 600; }
select, textarea { font: inherit; width: 100%; box-sizing: border-box; }
textarea { min-height: 5rem; }
button { font: inherit; margin-top: 0.75rem; padding: 0.4rem 1.5rem; }
pre { background: #f5f5f5; padding: 1rem; overflow: auto; white-space: pre-wrap; }
code { color: #555; }
</style>
</head>
<body>
<h1>Bridge Console</h1>
<p><code id="endpoint"></code></p>

<label for="cmd">指令 / Command</label>
<select id="cmd"></select>

<label for="args">參數 / Arguments（JSON 陣列）</label>
<textarea id="args">[]</textarea>

<button id="run">執行 / Run</button>

<h2>結果 / Result</h2>
<pre id="out">-</pre>

<script>
(() => {
	'use strict';
	const endpoint = ${endpoint};
	const names = ${names};
	const cmdEl = document.getElementById('cmd');
	const argsEl = document.getElementById('args');
	const outEl = document.getElementById('out');

	document.getElementById('endpoint').textContent = endpoint;

	names.forEach(function (name) {
		const option = document.createElement('option');
		option.value = name;
		option.textContent = name;
		cmdEl.appendChild(option);
	});

	if (!names.length) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = '(no command registered)';
		cmdEl.appendChild(option);
	}

	function show(value) {
		outEl.textContent = typeof value === 'string'
			? value
			: JSON.stringify(value, null, 2);
	}

	async function run() {
		let args;
		try {
			args = JSON.parse(argsEl.value || '[]');
		} catch (e) {
			show('invalid JSON: ' + e.message);
			return;
		}

		if (!Array.isArray(args)) {
			args = [args];
		}

		const url = new URL(endpoint);
		url.searchParams.set('cmd', cmdEl.value);
		url.searchParams.set('args', JSON.stringify(args));

		try {
			const resp = await fetch(url.toString());
			const text = await resp.text();
			try { show(JSON.parse(text)); }
			catch (e) { show(text); }
		} catch (e) {
			show('request failed: ' + e.message);
		}
	}

	document.getElementById('run').addEventListener('click', run);
})();
</script>
</body>
</html>`;
}
