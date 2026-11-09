import type { IBrowserKind } from '@lazy-playwright/shared-types';
import { IBrowserLaunchArgs, IBrowserLaunchArgsWriteable } from '../types/browser-setting';

/** 判定函式的執行期參數 (Filter Context)，以物件形式一次傳入 */
export interface IFilterCliArgsContext
{
	/** 目前參數在 `args` 內的索引 */
	readonly index: number;
	/** 完整的參數陣列（唯讀），可用於相對位置等跨參數判定 */
	readonly args: IBrowserLaunchArgs;
	/** 目前過濾所屬的瀏覽器種類（`baseKind`），供依瀏覽器自定化判定 */
	readonly baseKind: IBrowserKind;
}

/**
 * 單一過濾條件：
 *
 * - `string`：字面前綴，命中即移除
 * - `RegExp`：測試命中即移除
 * - `fn`：判定函式，接收 {@link IFilterCliArgsContext}，回傳 `true` 表示移除該參數
 */
export type IFilterCliArgsByValue = (string & {}) | RegExp | ((arg: string, runtime?: IFilterCliArgsContext) => boolean);

/**
 * 判斷單一參數是否命中任一條件（字面前綴、正規表示式、判定函式）
 *
 * 未命中回傳 `false`；白名單外的條件型別一律拋出 `TypeError`，
 * 避免不支援的設定值被靜默忽略。
 *
 * @internal
 */
function _matchCliArg(
	arg: string,
	matchers: readonly IFilterCliArgsByValue[],
	context: IFilterCliArgsContext,
): boolean
{
	for (const matcher of matchers)
	{
		if (typeof matcher === 'string')
		{
			if (arg.startsWith(matcher))
			{
				return true;
			}
		}
		else if (matcher instanceof RegExp)
		{
			/** 含 `g` / `y` 旗標的正規式有狀態，測試前重設 `lastIndex` 避免跨呼叫殘留 */
			matcher.lastIndex = 0;

			if (matcher.test(arg))
			{
				return true;
			}
		}
		else if (typeof matcher === 'function')
		{
			if (matcher(arg, context))
			{
				return true;
			}
		}
		else
		{
			throw new TypeError(`${typeof matcher}: ${matcher} is not implemented or supported yet`);
		}
	}
	return false;
}

/**
 * 依條件集合過濾 CLI 參數，移除命中任一條件的參數
 *
 * 條件支援字面前綴、正規表示式與判定函式，
 * 其餘型別一律拋出 `TypeError`，
 *
 * 避免不支援的設定值被靜默忽略；
 * 用於過濾目標瀏覽器不支援的啟動參數，避免啟動時產生警告或錯誤。
 *
 * 旗標與其值以獨立 token 傳入時（如 `-width` / `800`），
 * 命中旗標會連同其值一併移除，避免殘留孤兒值 token；
 * 值以 `=` 內嵌（如 `--window-size=800,600`）或本身以 `-` 開頭（如相鄰旗標）時不受影響。
 */
export function filterCliArgsByPrefixes(
	args: IBrowserLaunchArgs,
	matchers: Iterable<IFilterCliArgsByValue>,
	baseKind: IBrowserKind,
): IBrowserLaunchArgsWriteable
{
	/** 一次物化，避免一次性 Iterable（如 generator）在逐參數比對時被耗盡 */
	const matcherList = [...matchers];
	const result: IBrowserLaunchArgsWriteable = [];

	let skipNext = false;

	for (const [index, arg] of args.entries())
	{
		if (skipNext)
		{
			skipNext = false;
			continue;
		}

		if (!_matchCliArg(arg, matcherList, { index, args, baseKind }))
		{
			result.push(arg);
			continue;
		}

		/**
		 * 命中旗標（以 `-` 開頭且值未以 `=` 內嵌）時，
		 * 若下一個 token 不以 `-` 開頭，即視為該旗標的獨立值，連同移除
		 */
		if (arg.startsWith('-') && !arg.includes('='))
		{
			const next = args[index + 1];

			if (next !== undefined && !next.startsWith('-'))
			{
				skipNext = true;
			}
		}
	}

	return result;
}

/** 各瀏覽器不支援的 CLI 參數條件登記表（key：`baseKind`） */
const _unsupportedCliArgsPrefixes = new Map<IBrowserKind, Set<IFilterCliArgsByValue>>();

/**
 * 註冊指定瀏覽器不支援的 CLI 參數條件
 *
 * 條件可為字面前綴、`RegExp` 或判定函式（見 {@link IFilterCliArgsByValue}）；
 * 各瀏覽器模組於載入時自行註冊；以 `Set` 累加，重複註冊不需重建容器。
 */
export function registerUnsupportedCliArgs(baseKind: IBrowserKind, matchers: Iterable<IFilterCliArgsByValue>): void
{
	let registered = _unsupportedCliArgsPrefixes.get(baseKind);

	if (!registered)
	{
		registered = new Set<IFilterCliArgsByValue>();
		_unsupportedCliArgsPrefixes.set(baseKind, registered);
	}

	for (const matcher of matchers)
	{
		registered.add(matcher);
	}
}

/**
 * 過濾指定瀏覽器不支援的 CLI 參數
 *
 * 以該瀏覽器已註冊的條件集合過濾；未註冊任何條件時原樣保留（回傳新陣列）。
 *
 * 實際使用時請直接呼叫 `filterUnsupportedCliArgs`。
 * 內部呼叫可使用 `_filterUnsupportedCliArgsCore` 來防止遞迴呼叫。
 *
 * @internal
 */
export function _filterUnsupportedCliArgsCore(baseKind: IBrowserKind, args: IBrowserLaunchArgs): IBrowserLaunchArgsWriteable
{
	return filterCliArgsByPrefixes(args, _unsupportedCliArgsPrefixes.get(baseKind) ?? [], baseKind);
}
