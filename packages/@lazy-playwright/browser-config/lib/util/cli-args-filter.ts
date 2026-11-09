import type { IBrowserKind } from '@lazy-playwright/shared-types';
import { IBrowserLaunchArgs, IBrowserLaunchArgsWriteable } from '../types/browser-setting';

export type IFilterCliArgsByValue = (string & {});

/**
 * 依前綴集合過濾 CLI 參數，移除命中任一前綴的參數
 *
 * 用於過濾目標瀏覽器不支援的啟動參數，避免啟動時產生警告或錯誤。
 */
export function filterCliArgsByPrefixes(
	args: IBrowserLaunchArgs,
	prefixes: Iterable<IFilterCliArgsByValue>,
): IBrowserLaunchArgsWriteable
{
	return args.filter(arg =>
	{
		for (const prefix of prefixes)
		{
			if (typeof prefix === 'string')
			{
				if (arg.startsWith(prefix))
				{
					return false;
				}
			}
			else
			{
				// TODO: handle regex
				throw new TypeError(`${typeof prefix}: ${prefix} is not implemented or supported yet`);
			}
		}
		return true;
	});
}

/** 各瀏覽器不支援的 CLI 參數前綴登記表（key：`baseKind`） */
const _unsupportedCliArgsPrefixes = new Map<IBrowserKind, Set<IFilterCliArgsByValue>>();

/**
 * 註冊指定瀏覽器不支援的 CLI 參數前綴
 *
 * 各瀏覽器模組於載入時自行註冊；以 `Set` 累加，重複註冊不需重建容器。
 */
export function registerUnsupportedCliArgs(baseKind: IBrowserKind, prefixes: Iterable<IFilterCliArgsByValue>): void
{
	let registered = _unsupportedCliArgsPrefixes.get(baseKind);

	if (!registered)
	{
		registered = new Set<IFilterCliArgsByValue>();
		_unsupportedCliArgsPrefixes.set(baseKind, registered);
	}

	for (const prefix of prefixes)
	{
		registered.add(prefix);
	}
}

/**
 * 過濾指定瀏覽器不支援的 CLI 參數
 *
 * 以該瀏覽器已註冊的前綴集合過濾；未註冊任何前綴時原樣保留（回傳新陣列）。
 */
export function filterUnsupportedCliArgs(baseKind: IBrowserKind, args: IBrowserLaunchArgs): IBrowserLaunchArgsWriteable
{
	return filterCliArgsByPrefixes(args, _unsupportedCliArgsPrefixes.get(baseKind) ?? []);
}
