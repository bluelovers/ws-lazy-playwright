import type { Frame, Request, Response } from 'playwright';

/** URL 拆解結果 (URL Parts)：作為各類 URL 模式的比對輸入 */
export interface IUrlParts
{
	/** 完整 URL (Href) */
	href: string;
	/** 主機 (Host)，含 port；URL 無法解析時為空字串 */
	host: string;
	/** 路徑 (Pathname)，不含 query */
	pathname: string;
	/** 查詢字串 (Search)，含開頭 `?`；無 query 時為空字串 */
	search: string;
}

/** `on('request')` 事件承載 (Event Payload) */
export interface INetworkRequestEvent extends IUrlParts
{
	/** 事件種類 (Event Kind) */
	readonly kind: 'request';
	/** 對應的請求物件 */
	request: Request;
	/** 資源類型 (Resource Type)，例如 `xhr` / `document` / `image` */
	resourceType: string;
	/** 是否為導航請求 (Navigation Request) */
	isNavigation: boolean;
	/**
	 * 類型候選 (Type Candidates)：`type` 過濾的比對基準
	 *
	 * request 階段尚無 response header，候選僅有 `resourceType`
	 */
	types: string[];
}

/** `on('response')` 事件承載 (Event Payload) */
export interface INetworkResponseEvent extends IUrlParts
{
	/** 事件種類 (Event Kind) */
	readonly kind: 'response';
	/** 對應的請求物件 */
	request: Request;
	/** 對應的回應物件 */
	response: Response;
	/** 資源類型 (Resource Type)，例如 `xhr` / `document` / `image` */
	resourceType: string;
	/** 是否為導航請求 (Navigation Request) */
	isNavigation: boolean;
	/**
	 * 類型候選 (Type Candidates)：`type` 過濾的比對基準
	 *
	 * 含 `content-type` 的逐層拆解結果，故 `json` 可同時命中
	 * `application/json` 與 `application/vnd.api+json`
	 */
	types: string[];
	/** 原始 `content-type` header；無該 header 時為 `undefined` */
	contentType: string | undefined;
}

/**
 * `on('navigation')` 事件承載 (Event Payload)：框架完成跳轉 (Frame Navigated) 時觸發
 *
 * 其中的 `href` 為跳轉後的 URL
 */
export interface INetworkNavigationEvent extends IUrlParts
{
	/** 事件種類 (Event Kind) */
	readonly kind: 'navigation';
	/** 完成跳轉的框架 (Frame) */
	frame: Frame;
	/**
	 * 跳轉前的 URL
	 *
	 * 監聽器註冊後的首次跳轉沒有前次紀錄，為 `undefined`
	 */
	from: string | undefined;
	/** 是否為主框架 (Main Frame)，即沒有父框架 */
	isMainFrame: boolean;
}

/** 任一網路監聽事件 (Network Event)，供函式型模式統一接收 */
export type INetworkEvent = INetworkRequestEvent | INetworkResponseEvent | INetworkNavigationEvent;

/**
 * URL 函式型模式 (Pattern)：接收拆解後的 URL 與事件承載，
 * 回傳 truthy 即視為符合
 */
export type IUrlPatternFn = (parts: IUrlParts, event: INetworkEvent) => unknown;

/** URL 模式：字串走 glob（由 micromatch 比對）、正則逐次比對、函式自訂 */
export type IUrlPattern = RegExp | string | IUrlPatternFn;

/** URL 模式輸入：單一模式，或陣列（陣列內任一符合即通過，OR） */
export type IUrlPatternInput = IUrlPattern | readonly IUrlPattern[];

/**
 * 類型函式型模式 (Pattern)：接收類型候選與事件承載，
 * 回傳 truthy 即視為符合
 */
export type ITypePatternFn = (
	types: readonly string[],
	event: INetworkRequestEvent | INetworkResponseEvent,
) => unknown;

/** 類型模式：字串為不分大小寫的完全相符、正則逐候選比對、函式自訂 */
export type ITypePattern = RegExp | string | ITypePatternFn;

/** 類型模式輸入：單一模式，或陣列（陣列內任一符合即通過，OR） */
export type ITypePatternInput = ITypePattern | readonly ITypePattern[];

/** 網路監聽過濾器 (Network Filter)：註冊時編譯一次，事件抵達時只做比對 */
export interface INetworkFilter
{
	/** URL 模式；陣列代表 OR */
	url?: IUrlPatternInput;
	/**
	 * 字串 / 正則模式的比對目標是否要求含 host (主機)
	 *
	 * - `false`（預設）：僅比對 `pathname`
	 * - `true`：比對 `host + pathname`
	 *
	 * 對函式型模式無效——函式可自行讀取 `parts.host`
	 */
	host?: boolean;
	/**
	 * 類型過濾 (Type Filter)：比對事件的 {@link INetworkRequestEvent.types} /
	 * {@link INetworkResponseEvent.types} 候選
	 *
	 * 注意：`json` 等依賴 `content-type` 的類型僅能在 response 階段解析，
	 * request 階段的候選只有 `resourceType`
	 */
	type?: ITypePatternInput;
	/** 是否限定導航請求 (`request.isNavigationRequest()`)；僅 request / response 事件適用 */
	navigation?: boolean;
	/** 是否限定主框架導航；僅 navigation 事件適用 */
	mainFrame?: boolean;
}

/** request 事件監聽器 (Listener)：回傳值會被忽略 */
export type INetworkRequestListener = (event: INetworkRequestEvent) => unknown;

/** response 事件監聽器 (Listener)：回傳值會被忽略 */
export type INetworkResponseListener = (event: INetworkResponseEvent) => unknown;

/** navigation 事件監聽器 (Listener)：回傳值會被忽略 */
export type INetworkNavigationListener = (event: INetworkNavigationEvent) => unknown;
