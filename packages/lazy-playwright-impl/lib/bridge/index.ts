import type { BrowserContext, Page, Request, Route } from 'playwright';
import {
	DEFAULT_BRIDGE_GLOBAL_NAME,
	DEFAULT_FAKE_API_BASE,
	BRIDGE_CORS_HEADERS,
} from './const';
import { buildBridgeClientScript } from './client-script';
import { buildBridgeConsolePage } from './console';
import { consoleLogger } from '../logger';
import {
	buildBridgeHtmlPage,
	buildBridgeRoutePattern,
	parseBridgeRequest,
	serializeBridgeResponse,
} from './protocol';
import type {
	IBridgeCommandHandler,
	IBridgeOptions,
	IBridgeRequest,
	IBridgeResponse,
	IBrowserBridge,
} from './types';
import type { INullable } from '../types';
import { EnumLogLabel } from '../logger';

/**
 * 頁面通訊協議 (Page Bridge)
 *
 * 以 `context.route` 攔截 {@link DEFAULT_FAKE_API_BASE} 底下的請求，
 * 將 `cmd` / `args` 交給已註冊的命令處理器，再以 JSON 回傳結果。
 * 頁面端可直接 `fetch` 端點，或在啟用 `exposeGlobal` 後使用 window 便利函式。
 */
export class PageBridge implements IBrowserBridge
{
	readonly fakeApiBase: string;
	readonly globalName: string;
	readonly exposeGlobal: boolean;

	protected readonly _commands = new Map<string, IBridgeCommandHandler>();

	/** 以 Promise 記錄安裝狀態，避免兩個接線路徑重複註冊路由 */
	protected readonly _installed = new WeakMap<BrowserContext, Promise<void>>();

	constructor(options: IBridgeOptions = {})
	{
		this.fakeApiBase = (options.fakeApiBase ?? DEFAULT_FAKE_API_BASE).replace(/\/+$/, '');
		this.globalName = options.globalName ?? DEFAULT_BRIDGE_GLOBAL_NAME;
		this.exposeGlobal = options.exposeGlobal ?? false;
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
		await context.route(this._routePattern(), route => this._handleRoute(route));

		if (this.exposeGlobal)
		{
			await context.addInitScript({
				content: buildBridgeClientScript({
					fakeApiBase: this.fakeApiBase,
					globalName: this.globalName,
				}),
			});
		}
	}

	protected _routePattern(): RegExp
	{
		return buildBridgeRoutePattern(this.fakeApiBase);
	}

	protected async _handleRoute(route: Route): Promise<void>
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

		const response: IBridgeResponse = parsed
			? await this._invoke(parsed, _resolvePage(request))
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

	protected async _invoke(request: IBridgeRequest, page: INullable<Page>): Promise<IBridgeResponse>
	{
		const handler = this._commands.get(request.cmd);

		if (!handler)
		{
			return { ok: false, error: `Unknown command: ${request.cmd}` };
		}

		try
		{
			const result = await handler(request.args, page);
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
