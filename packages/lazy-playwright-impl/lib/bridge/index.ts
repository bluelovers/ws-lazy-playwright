import type { BrowserContext, ConsoleMessage, Page, Request, Route } from 'playwright';
import {
	DEFAULT_BRIDGE_GLOBAL_NAME,
	DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME,
	DEFAULT_FAKE_API_BASE,
	BRIDGE_CORS_HEADERS,
	BRIDGE_CONSOLE_EVENT,
} from './const';
import { buildBridgeClientScript } from './script-api/client-script';
import { buildBridgeConsolePage } from './ui/console';
import { buildBridgeConsoleScript, parseBridgeConsoleMessage, type IBridgeConsoleResponse } from './script-api/console-channel';
import { consoleLogger } from '../logger';
import {
	buildBridgeRoutePattern,
	parseBridgeRequest,
	serializeBridgeResponse,
} from './protocol';
import { buildBridgeHtmlPage } from './ui/endpoint';
import type {
	IBridgeCommandHandler,
	IBridgeCommandHost,
	IBridgeOptions,
	IBridgeRequest,
	IBridgeResponse,
	IBrowserBridge,
	IBrowserCtx,
} from './types';
import type { INullable } from '../types/types';
import { EnumLogLabel } from '../logger';

/**
 * 頁面通訊協議 (Page Bridge)
 *
 * 以 `context.route` 攔截 {@link DEFAULT_FAKE_API_BASE} 底下的請求，
 * 將 `cmd` / `args` 交給已註冊的命令處理器，再以 JSON 回傳結果。
 * 頁面端可直接 `fetch` 端點，或在啟用 `exposeGlobal` 後使用 window 便利函式。
 *
 * 另提供可選的 console 訊息通道（`useConsole`）：
 * 由頁面 `console.log` 發送帶前綴的命令，Node 端聽取 console 訊息後執行，
 * 再以 `CustomEvent` 將回應派發回頁面。
 */
export class PageBridge implements IBrowserBridge
{
	readonly fakeApiBase: string;
	readonly globalName: string;
	readonly exposeGlobal: boolean;
	readonly useConsole: boolean;
	readonly exposeConsoleGlobal: boolean;
	readonly consoleGlobalName: string;

	protected readonly _host: IBridgeCommandHost;
	protected readonly _commands = new Map<string, IBridgeCommandHandler>();

	/** 以 Promise 記錄安裝狀態，避免兩個接線路徑重複註冊路由 */
	protected readonly _installed = new WeakMap<BrowserContext, Promise<void>>();

	/** 已接線 console 聽取器的分頁，避免重複掛載 */
	protected readonly _consoleWiredPages = new WeakSet<Page>();

	constructor(host: IBridgeCommandHost, options: IBridgeOptions = {})
	{
		this._host = host;
		this.fakeApiBase = (options.fakeApiBase ?? DEFAULT_FAKE_API_BASE).replace(/\/+$/, '');
		this.globalName = options.globalName ?? DEFAULT_BRIDGE_GLOBAL_NAME;
		this.exposeGlobal = options.exposeGlobal ?? false;
		this.useConsole = options.useConsole ?? false;
		this.consoleGlobalName = options.consoleGlobalName ?? DEFAULT_BRIDGE_CONSOLE_GLOBAL_NAME;

		/** 注入的便利函式必須以 console 訊息通道為基礎，避免註冊後呼叫永不回應 */
		this.exposeConsoleGlobal = options.exposeConsoleGlobal ?? false;

		if (this.exposeConsoleGlobal && !this.useConsole)
		{
			throw new Error('bridge: exposeConsoleGlobal requires useConsole');
		}
	}

	get commands(): readonly string[]
	{
		return [...this._commands.keys()];
	}

	register(name: string, handler: IBridgeCommandHandler): this
	{
		if (!name)
		{
			throw new Error('bridge command name is required');
		}

		this._commands.set(name, handler);
		return this;
	}

	registerAll(commands: Record<string, IBridgeCommandHandler>): this
	{
		for (const [name, handler] of Object.entries(commands))
		{
			this.register(name, handler);
		}

		return this;
	}

	has(name: string): boolean
	{
		return this._commands.has(name);
	}

	unregister(name: string): boolean
	{
		return this._commands.delete(name);
	}

	install(context: BrowserContext): Promise<void>
	{
		let pending = this._installed.get(context);

		if (!pending)
		{
			pending = this._install(context);
			this._installed.set(context, pending);
		}

		return pending;
	}

	protected async _install(context: BrowserContext): Promise<void>
	{
		await context.route(this._routePattern(), route => this._handleRoute(route, context));

		if (this.exposeGlobal)
		{
			await context.addInitScript({
				content: buildBridgeClientScript({
					fakeApiBase: this.fakeApiBase,
					globalName: this.globalName,
				}),
			});
		}

		/**
		 * console 通道分兩層：
		 *
		 * - `useConsole`：僅 Node 端聽取 console 訊息（非侵入式，不注入任何腳本）
		 * - `exposeConsoleGlobal`：另行注入頁面端便利函式，供頁面以 Promise 呼叫
		 */
		if (this.useConsole)
		{
			this._wireConsoleChannel(context);
		}

		if (this.exposeConsoleGlobal)
		{
			await context.addInitScript({
				content: buildBridgeConsoleScript(this.consoleGlobalName),
			});
		}
	}

	/**
	 * 接線 console 訊息通道
 *
	 * 已存在的分頁與後續開啟的分頁都會掛上 console 聽取器，
	 * 以 {@link parseBridgeConsoleMessage} 辨識命令後執行，再將回應派發回頁面。
	 */
	protected _wireConsoleChannel(context: BrowserContext): void
	{
		const wire = (page: Page): void =>
		{
			if (this._consoleWiredPages.has(page)) return;
			this._consoleWiredPages.add(page);

			page.on('console', message => void this._handleConsoleMessage(page, message));
		};

		for (const page of context.pages())
		{
			wire(page);
		}

		context.on('page', wire);
	}

	/** 處理頁面 console 訊息：非本通道的訊息直接忽略 */
	protected async _handleConsoleMessage(page: Page, message: ConsoleMessage): Promise<void>
	{
		const parsed = parseBridgeConsoleMessage(message);

		if (!parsed)
		{
			return;
		}

		const { id, ...request } = parsed;

		consoleLogger.debug(EnumLogLabel.Bridge, 'console receive', request);

		const response = await this._invoke(request, page, this._buildCtx(page.context()));

		if (response.ok)
		{
			consoleLogger.debug(EnumLogLabel.Bridge, 'console respond', response);
		}
		else
		{
			consoleLogger.warn(EnumLogLabel.Bridge, 'console respond', response);
		}

		try
		{
			const detail: IBridgeConsoleResponse = { id, ...response };

			await page.evaluate(
				({ event, detail }) =>
				{
					window.dispatchEvent(new CustomEvent(event, { detail }));
				},
				{ event: BRIDGE_CONSOLE_EVENT, detail },
			);
		}
		catch (e)
		{
			/** 分頁可能已關閉或導航中，回應派發失敗不影響後續訊息處理 */
			consoleLogger.warn(EnumLogLabel.Bridge, 'console respond dispatch failed:', e);
		}
	}

	/** 由所屬 context 組出執行上下文；`ctx.page` 為主頁面 */
	protected _buildCtx(context: BrowserContext): IBrowserCtx
	{
		const mainPage = this._host.page;

		return mainPage ? { context, page: mainPage } : { context };
	}

	protected _routePattern(): RegExp
	{
		return buildBridgeRoutePattern(this.fakeApiBase);
	}

	protected async _handleRoute(route: Route, context: BrowserContext): Promise<void>
	{
		const request = route.request();

		/** 跨來源請求的 CORS preflight */
		if (request.method() === 'OPTIONS')
		{
			await route.fulfill({ status: 204, headers: { ...BRIDGE_CORS_HEADERS } });
			return;
		}

		const parsed = parseBridgeRequest(request.url());
		const isDocument = request.resourceType() === 'document';

		/** 位址列導航且未指定命令時，提供可互動的指令控制台 */
		if (isDocument && !parsed)
		{
			await route.fulfill({
				status: 200,
				contentType: 'text/html; charset=utf-8',
				headers: { ...BRIDGE_CORS_HEADERS },
				body: buildBridgeConsolePage(this.fakeApiBase, this.commands),
			});
			return;
		}

		if (parsed)
		{
			consoleLogger.debug(EnumLogLabel.Bridge, 'receive', parsed);
		}
		else
		{
			consoleLogger.warn(EnumLogLabel.Bridge, 'malformed', request.url());
		}

		const page = _resolvePage(request);

		/** `ctx.page` 為主頁面，`page` 參數則是發出請求的頁面 */
		const ctx = this._buildCtx(context);

		const response: IBridgeResponse = parsed
			? await this._invoke(parsed, page, ctx)
			: { ok: false, error: 'malformed bridge request' };

		if (response.ok)
		{
			consoleLogger.debug(EnumLogLabel.Bridge, 'respond', response);
		}
		else
		{
			consoleLogger.warn(EnumLogLabel.Bridge, 'respond', response);
		}

		/** 位址列直接導航時回傳可讀的 HTML，其餘（fetch / XHR）回傳 JSON */
		if (isDocument)
		{
			await route.fulfill({
				status: 200,
				contentType: 'text/html; charset=utf-8',
				headers: { ...BRIDGE_CORS_HEADERS },
				body: buildBridgeHtmlPage(parsed, response),
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json; charset=utf-8',
			headers: { ...BRIDGE_CORS_HEADERS },
			body: serializeBridgeResponse(response),
		});
	}

	protected async _invoke(
		request: IBridgeRequest,
		page: INullable<Page>,
		ctx: IBrowserCtx,
	): Promise<IBridgeResponse>
	{
		const handler = this._commands.get(request.cmd);

		if (!handler)
		{
			return { ok: false, error: `Unknown command: ${request.cmd}` };
		}

		try
		{
			const result = await handler(request.args, page, ctx, this._host);
			return { ok: true, result: result ?? null };
		}
		catch (e)
		{
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	}
}

/** 由請求取得來源分頁；服務工作者等無 frame 的請求回傳 `null` */
function _resolvePage(request: Request): INullable<Page>
{
	try
	{
		return request.frame()?.page() ?? null;
	}
	catch
	{
		return null;
	}
}
