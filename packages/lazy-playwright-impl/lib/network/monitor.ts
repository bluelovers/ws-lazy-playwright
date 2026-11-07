import { console } from 'debug-color2';
import type { Frame, Page, Request, Response } from 'playwright';
import { EnumLogLabel } from '../logger';
import {
	collectTypeCandidates,
	compileNetworkFilter,
	parseUrlParts,
	type ICompiledNetworkFilter,
} from './match';
import type {
	INetworkEvent,
	INetworkEventKind,
	INetworkFilter,
	INetworkListener,
	INetworkNavigationEvent,
	INetworkNavigationListener,
	INetworkRequestEvent,
	INetworkRequestListener,
	INetworkResponseEvent,
	INetworkResponseListener,
} from './types';

/** 已註冊的監聽器條目：過濾器在註冊時編譯完成，事件抵達時只做比對 */
interface IListenerEntry<T extends INetworkEvent>
{
	/** 使用者提供的事件處理器 */
	listener: INetworkListener<T>;
	/** 註冊時編譯的過濾器；未提供過濾器時為 `undefined`（全通過） */
	filter?: (event: T) => boolean;
}

/**
 * 網路監聽器 (Network Monitor)
 *
 * 為單一 `Page` 掛上 `request` / `response` / 分頁跳轉 (Navigation) 監聽，
 * 事件可搭配 {@link INetworkFilter} 以 URL 模式（正則 / glob 字串 / 函式）、
 * 類型與導航條件過濾；過濾器於註冊時編譯一次，不適用於該事件種類的欄位會被忽略。
 *
 * @example
 * const monitor = new NetworkMonitor(page);
 *
 * monitor.on('response', { type: 'json', url: '/api/**' }, ({ href, response }) => {
 * 	console.log(href, response.status());
 * });
 *
 * monitor.on('navigation', { mainFrame: true }, ({ from, href }) => {
 * 	console.log(from, '->', href);
 * });
 *
 * monitor.dispose();
 */
export class NetworkMonitor
{
	/** 被監聽的分頁 */
	protected readonly _page: Page;

	/** request 監聽器清單 */
	protected readonly _requestListeners: Array<IListenerEntry<INetworkRequestEvent>> = [];

	/** response 監聽器清單 */
	protected readonly _responseListeners: Array<IListenerEntry<INetworkResponseEvent>> = [];

	/** navigation 監聽器清單 */
	protected readonly _navigationListeners: Array<IListenerEntry<INetworkNavigationEvent>> = [];

	/** 各框架最近一次已知的 URL，供導航事件產出 `from` */
	protected readonly _frameUrls: WeakMap<Frame, string> = new WeakMap();

	/** 已接上 page 事件的監聽種類 */
	protected readonly _wired = new Set<INetworkEventKind>();

	/**
	 * @param page - 要監聽的分頁
	 */
	constructor(page: Page)
	{
		this._page = page;
	}

	/**
	 * 註冊事件監聽器 (Event Listener)
	 *
	 * 過濾器可省略；提供時會在註冊時編譯一次。
	 * 同一個處理器重複註冊會成為多個獨立條目，各自比對各自派發。
	 *
	 * @param event - 事件種類：`request` / `response` / `navigation`
	 * @param filter - 過濾器，可省略
	 * @param listener - 事件處理器，回傳值會被忽略
	 * @returns 目前的監聽器實例，可串接
	 *
	 * @example
	 * monitor.on('request', ({ href }) => console.log(href));
	 *
	 * monitor.on('request', { navigation: true, type: 'document' }, ({ request }) => {
	 * 	console.log('goto', request.url());
	 * });
	 */
	on(event: 'request', listener: INetworkRequestListener): this;
	on(event: 'request', filter: INetworkFilter, listener: INetworkRequestListener): this;
	on(event: 'response', listener: INetworkResponseListener): this;
	on(event: 'response', filter: INetworkFilter, listener: INetworkResponseListener): this;
	on(event: 'navigation', listener: INetworkNavigationListener): this;
	on(event: 'navigation', filter: INetworkFilter, listener: INetworkNavigationListener): this;
	on(
		event: INetworkEventKind,
		filterOrListener: INetworkFilter | INetworkRequestListener | INetworkResponseListener | INetworkNavigationListener,
		listener?: INetworkRequestListener | INetworkResponseListener | INetworkNavigationListener,
	): this
	{
		/** 第一參數依是否為函式區分為過濾器或處理器 */
		const hasFilter = typeof filterOrListener !== 'function';
		const filter = hasFilter ? filterOrListener as INetworkFilter : undefined;
		const fn = (hasFilter ? listener : filterOrListener) as
			INetworkRequestListener | INetworkResponseListener | INetworkNavigationListener;
		const compiled = compileNetworkFilter(filter);

		switch (event)
		{
			case 'request':
			{
				/** 事件種類決定實際處理器型別，此處把放寬的參數型別收斂回 request 處理器 */
				const requestListener = fn as INetworkRequestListener;

				this._add(
					this._requestListeners,
					compiled && (e => compiled.matchRequest(e)),
					requestListener,
					() => this._wire('request'),
				);
				break;
			}
			case 'response':
			{
				/** 事件種類決定實際處理器型別，此處把放寬的參數型別收斂回 response 處理器 */
				const responseListener = fn as INetworkResponseListener;

				this._add(
					this._responseListeners,
					compiled && (e => compiled.matchResponse(e)),
					responseListener,
					() => this._wire('response'),
				);
				break;
			}
			case 'navigation':
			{
				/** 事件種類決定實際處理器型別，此處把放寬的參數型別收斂回 navigation 處理器 */
				const navigationListener = fn as INetworkNavigationListener;

				this._add(
					this._navigationListeners,
					compiled && (e => compiled.matchNavigation(e)),
					navigationListener,
					() => this._wire('navigation'),
				);
				break;
			}
		}

		return this;
	}

	/**
	 * 移除事件監聽器 (Event Listener)
	 *
	 * 依處理器參照比對；該事件種類的監聽器全部移除後會一併解除 page 接線
	 *
	 * @param event - 事件種類：`request` / `response` / `navigation`
	 * @param listener - 註冊時提供的處理器
	 * @returns 目前的監聽器實例，可串接
	 */
	off(event: 'request', listener: INetworkRequestListener): this;
	off(event: 'response', listener: INetworkResponseListener): this;
	off(event: 'navigation', listener: INetworkNavigationListener): this;
	off(
		event: INetworkEventKind,
		listener: INetworkRequestListener | INetworkResponseListener | INetworkNavigationListener,
	): this
	{
		switch (event)
		{
			case 'request':
			{
				this._remove(this._requestListeners, listener as INetworkRequestListener, () => this._unwire('request'));
				break;
			}
			case 'response':
			{
				this._remove(this._responseListeners, listener as INetworkResponseListener, () => this._unwire('response'));
				break;
			}
			case 'navigation':
			{
				this._remove(this._navigationListeners, listener as INetworkNavigationListener, () => this._unwire('navigation'));
				break;
			}
		}

		return this;
	}

	/**
	 * 解除全部監聽器與 page 接線
	 *
	 * 之後再透過 `on` 註冊仍可正常使用
	 */
	dispose(): void
	{
		this._requestListeners.length = 0;
		this._responseListeners.length = 0;
		this._navigationListeners.length = 0;

		this._unwire('request');
		this._unwire('response');
		this._unwire('navigation');
	}

	/**
	 * 註冊監聽器條目；該事件種類的首次註冊才接上 page 事件，
	 * 讓未使用的事件種類不承受任何監聽開銷
	 */
	protected _add<T extends INetworkEvent>(
		listeners: Array<IListenerEntry<T>>,
		filter: ((event: T) => boolean) | undefined,
		listener: INetworkListener<T>,
		wire: () => void,
	): void
	{
		if (listeners.length === 0)
		{
			wire();
		}

		listeners.push({ listener, filter });
	}

	/**
	 * 移除監聽器條目；清空後解除該事件種類的接線，
	 * 讓頁面在無訂閱者時不承受任何監聽開銷
	 */
	protected _remove<T extends INetworkEvent>(
		listeners: Array<IListenerEntry<T>>,
		listener: INetworkListener<T>,
		unwire: () => void,
	): void
	{
		const index = listeners.findIndex(entry => entry.listener === listener);

		if (index === -1)
		{
			return;
		}

		listeners.splice(index, 1);

		if (listeners.length === 0)
		{
			unwire();
		}
	}

	/** 派發事件給監聽器：過濾不通過的條目略過，單一處理器抛錯不影響其餘處理器 */
	protected _dispatch<T extends INetworkEvent>(
		listeners: Array<IListenerEntry<T>>,
		event: T,
	): void
	{
		for (const { listener, filter } of listeners)
		{
			if (filter && !filter(event))
			{
				continue;
			}

			try
			{
				listener(event);
			}
			catch (e)
			{
				console.error(EnumLogLabel.Network, 'listener failed:', e);
			}
		}
	}

	/**
	 * 接上對應的 page 事件（僅該種類首次註冊時）
	 *
	 * `_wired` 保證同種類重複接線不會掛上第二個處理器
	 */
	protected _wire(kind: INetworkEventKind): void
	{
		if (this._wired.has(kind))
		{
			return;
		}

		this._wired.add(kind);

		/** 事件名與處理器的對應各自固定，以 switch 取得完整型別檢查 */
		switch (kind)
		{
			case 'request':
			{
				this._page.on('request', this._onRequest);
				break;
			}
			case 'response':
			{
				this._page.on('response', this._onResponse);
				break;
			}
			case 'navigation':
			{
				this._page.on('framenavigated', this._onFrameNavigated);
				break;
			}
		}
	}

	/** 解除對應的 page 事件接線（未接線的種類略過） */
	protected _unwire(kind: INetworkEventKind): void
	{
		if (!this._wired.has(kind))
		{
			return;
		}

		this._wired.delete(kind);

		switch (kind)
		{
			case 'request':
			{
				this._page.off('request', this._onRequest);
				break;
			}
			case 'response':
			{
				this._page.off('response', this._onResponse);
				break;
			}
			case 'navigation':
			{
				this._page.off('framenavigated', this._onFrameNavigated);
				break;
			}
		}
	}

	/** `request` 事件處理器：組出事件承載後派發給已註冊監聽器 */
	protected readonly _onRequest = (request: Request): void =>
	{
		/** 尚無監聽器時直接略過，避免每個請求都執行 URL 解析與事件組裝 */
		if (this._requestListeners.length === 0)
		{
			return;
		}

		const resourceType = request.resourceType();
		const event: INetworkRequestEvent = {
			...parseUrlParts(request.url()),
			kind: 'request',
			request,
			resourceType,
			isNavigation: request.isNavigationRequest(),
			/** request 階段尚無 response header，類型候選僅有資源類型 */
			types: [resourceType],
		};

		this._dispatch(this._requestListeners, event);
	};

	/** `response` 事件處理器：組出事件承載後派發給已註冊監聽器 */
	protected readonly _onResponse = (response: Response): void =>
	{
		/** 尚無監聽器時直接略過，避免每個回應都執行 URL 解析與候選收集 */
		if (this._responseListeners.length === 0)
		{
			return;
		}

		const request = response.request();
		const resourceType = request.resourceType();
		const contentType = response.headers()['content-type'];
		const event: INetworkResponseEvent = {
			...parseUrlParts(request.url()),
			kind: 'response',
			request,
			response,
			resourceType,
			isNavigation: request.isNavigationRequest(),
			types: collectTypeCandidates(resourceType, contentType),
			contentType,
		};

		this._dispatch(this._responseListeners, event);
	};

	/** `framenavigated` 事件處理器：追蹤框架前次 URL 並派發導航事件 */
	protected readonly _onFrameNavigated = (frame: Frame): void =>
	{
		/** 尚無監聽器時直接略過，也不同步前次 URL——首次註冊後的首次跳轉 `from` 為 `undefined` */
		if (this._navigationListeners.length === 0)
		{
			return;
		}

		const href = frame.url();

		/**
		 * 先取前次紀錄再更新：`from` 需要本次跳轉前的值，
		 * 而 WeakMap 只保存最近一次已知 URL
		 */
		const from = this._frameUrls.get(frame);
		this._frameUrls.set(frame, href);

		const event: INetworkNavigationEvent = {
			...parseUrlParts(href),
			kind: 'navigation',
			frame,
			from,
			isMainFrame: frame.parentFrame() === null,
		};

		this._dispatch(this._navigationListeners, event);
	};
}
