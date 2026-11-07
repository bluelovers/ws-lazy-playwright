import micromatch from 'micromatch';
import type {
	INetworkEvent,
	INetworkFilter,
	INetworkNavigationEvent,
	INetworkRequestEvent,
	INetworkResponseEvent,
	ITypePattern,
	ITypePatternFn,
	IUrlParts,
	IUrlPattern,
	IUrlPatternFn,
} from './types';

/** 編譯後的 URL 模式比對器 */
export type IUrlMatcher = (parts: IUrlParts, event: INetworkEvent) => boolean;

/** 編譯後的類型模式比對器 */
export type ITypeMatcher = (
	types: readonly string[],
	event: INetworkRequestEvent | INetworkResponseEvent,
) => boolean;

/**
 * 解析 URL 為比對用的拆解結果 (URL Parts)
 *
 * 無法解析的 URL 退回以原始字串作為 `pathname`，
 * 避免單一異常字串中斷整條監聽流程
 *
 * @param url - 任意 URL 字串
 * @returns 拆解後的 URL 各段
 */
export function parseUrlParts(url: string): IUrlParts
{
	try
	{
		const parsed = new URL(url);

		return {
			href: parsed.href,
			host: parsed.host,
			pathname: parsed.pathname,
			search: parsed.search,
		};
	}
	catch
	{
		return { href: url, host: '', pathname: url, search: '' };
	}
}

/**
 * 收集類型候選 (Type Candidates)：`type` 過濾的比對基準
 *
 * response 階段會把 `content-type` 逐層拆解（完整值 → media type →
 * 主類型 / 子類型 → `+` 分段），使 `json` 同時命中 `application/json`
 * 與 `application/vnd.api+json`
 *
 * @param resourceType - Playwright 資源類型，例如 `xhr`
 * @param contentType - 原始 `content-type` header，可為 `undefined`
 * @returns 去重後的候選字串陣列
 */
export function collectTypeCandidates(resourceType: string, contentType: string | undefined): string[]
{
	const candidates = new Set<string>([resourceType]);

	if (contentType)
	{
		/**
		 * 候選統一轉小寫，使 `type` 字串比對
		 * 不受 header 原始大小寫影響
		 */
		const raw = contentType.toLowerCase();
		candidates.add(raw);

		const media = raw.split(';')[0].trim();

		if (media)
		{
			candidates.add(media);

			const [type, subtype] = media.split('/');

			if (type)
			{
				candidates.add(type);
			}

			if (subtype)
			{
				candidates.add(subtype);

				/**
				 * `+` 分段（如 `vnd.api+json` 拆出 `vnd.api` / `json`）
				 * 也納入候選，讓 `json` 能命中 vendor 擴充的 media type
				 */
				for (const part of subtype.split('+'))
				{
					if (part)
					{
						candidates.add(part);
					}
				}
			}
		}
	}

	return [...candidates];
}

/**
 * 編譯 URL 模式為單一比對器 (OR)；未提供 `url` 時回傳 `undefined`（全通過）
 *
 * @param filter - 網路過濾器
 */
export function compileUrlMatcher(filter: INetworkFilter): IUrlMatcher | undefined
{
	const input = filter.url;

	if (input == null)
	{
		return undefined;
	}

	const patterns = (Array.isArray(input) ? input : [input]) as readonly IUrlPattern[];
	const matchers = patterns.map(pattern => compileUrlPattern(pattern, filter.host === true));

	/** 陣列模式採 OR：任一模式符合即通過 */
	return (parts, event) => matchers.some(matcher => matcher(parts, event));
}

/**
 * 依模式型別編譯比對器：字串走 micromatch glob、正則逐次比對、函式直接委派
 */
function compileUrlPattern(pattern: IUrlPattern, withHost: boolean): IUrlMatcher
{
	if (typeof pattern === 'function')
	{
		const match: IUrlPatternFn = pattern;

		return (parts, event) => !!match(parts, event);
	}

	if (typeof pattern === 'string')
	{
		const isMatch = micromatch.matcher(pattern, { nocase: true });

		return parts => matchGlob(isMatch, targetOf(parts, withHost));
	}

	const re: RegExp = pattern;

	return parts =>
	{
		/** 含 `g` / `y` 的正則共享 `lastIndex`，每次比對前重置以免跨事件漏比 */
		re.lastIndex = 0;

		return re.test(targetOf(parts, withHost));
	};
}

/**
 * 取得字串 / 正則模式的比對目標：
 * `host` 開啟時為 `host + pathname`，否則僅 `pathname`
 */
function targetOf(parts: IUrlParts, withHost: boolean): string
{
	return withHost ? `${parts.host}${parts.pathname}` : parts.pathname;
}

/**
 * 以 glob 比對目標字串
 *
 * `pathname` 恆以 `/` 開頭，會擋住 `*.html` 這類跨不過分隔符的模式，
 * 故不符時再以去掉開頭 `/` 的形式嘗試一次
 */
function matchGlob(isMatch: (value: string) => boolean, target: string): boolean
{
	if (isMatch(target))
	{
		return true;
	}

	return target.startsWith('/') && isMatch(target.slice(1));
}

/**
 * 編譯類型模式為單一比對器 (OR)；未提供 `type` 時回傳 `undefined`（全通過）
 *
 * @param filter - 網路過濾器
 */
export function compileTypeMatcher(filter: INetworkFilter): ITypeMatcher | undefined
{
	const input = filter.type;

	if (input == null)
	{
		return undefined;
	}

	const patterns = (Array.isArray(input) ? input : [input]) as readonly ITypePattern[];
	const matchers = patterns.map(pattern => compileTypePattern(pattern));

	/** 陣列模式採 OR：任一候選符合即通過 */
	return (types, event) => matchers.some(matcher => matcher(types, event));
}

/**
 * 依模式型別編譯類型比對器：
 * 字串為不分大小寫的完全相符、正則逐候選比對、函式直接委派
 */
function compileTypePattern(pattern: ITypePattern): ITypeMatcher
{
	if (typeof pattern === 'function')
	{
		const match: ITypePatternFn = pattern;

		return (types, event) => !!match(types, event);
	}

	if (typeof pattern === 'string')
	{
		const expect = pattern.toLowerCase();

		return types => types.some(type => type === expect);
	}

	const re: RegExp = pattern;

	return types => types.some((type) =>
	{
		/** 含 `g` / `y` 的正則共享 `lastIndex`，每次比對前重置以免跨事件漏比 */
		re.lastIndex = 0;

		return re.test(type);
	});
}

/** 編譯後的過濾器：依事件種類只套用各自適用的欄位 */
export interface ICompiledNetworkFilter
{
	/** 比對 request 事件：套用 `url` / `host` / `type` / `navigation` */
	matchRequest(event: INetworkRequestEvent): boolean;
	/** 比對 response 事件：套用 `url` / `host` / `type` / `navigation` */
	matchResponse(event: INetworkResponseEvent): boolean;
	/** 比對 navigation 事件：套用 `url` / `host` / `mainFrame`（`type` / `navigation` 不適用） */
	matchNavigation(event: INetworkNavigationEvent): boolean;
}

/**
 * 編譯過濾器 (Compile Filter)：註冊監聽時呼叫一次，事件抵達時只做比對
 *
 * 不適用於該事件種類的欄位會被忽略（例如 navigation 事件不看 `type`）；
 * 未提供過濾器時回傳 `undefined`（全通過）
 *
 * @param filter - 使用者提供的過濾器，可為 `undefined`
 */
export function compileNetworkFilter(filter: INetworkFilter | undefined): ICompiledNetworkFilter | undefined
{
	if (!filter)
	{
		return undefined;
	}

	const matchUrl = compileUrlMatcher(filter);
	const matchType = compileTypeMatcher(filter);
	const { navigation, mainFrame } = filter;

	/**
	 * request / response 共用比對：先以 `navigation` 限定導航請求，
	 * 再依序比對 URL 與類型
	 */
	const matchNetworkEvent = (event: INetworkRequestEvent | INetworkResponseEvent): boolean =>
		(navigation === undefined || event.isNavigation === navigation)
		&& (!matchUrl || matchUrl(event, event))
		&& (!matchType || matchType(event.types, event));

	return {
		matchRequest: matchNetworkEvent,
		matchResponse: matchNetworkEvent,
		/** navigation 事件沒有請求 / 回應可比，故略過 `navigation` 與 `type` */
		matchNavigation: event =>
			(mainFrame === undefined || event.isMainFrame === mainFrame)
			&& (!matchUrl || matchUrl(event, event)),
	};
}
