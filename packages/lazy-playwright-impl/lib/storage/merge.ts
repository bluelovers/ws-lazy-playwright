import type { Cookie } from 'playwright';
import type { ISessionState } from './types';

type IOriginState = NonNullable<ISessionState['origins']>[number];
type ILocalStorageItem = NonNullable<IOriginState['localStorage']>[number];

/** Cookie 的唯一鍵：同 domain / path / name 視為同一筆 */
function _cookieKey(cookie: Cookie): string
{
	return `${cookie.domain}|${cookie.path}|${cookie.name}`;
}

/** 合併多組 Cookie，同鍵以後出現者覆寫 */
export function mergeCookies(groups: readonly (readonly Cookie[])[]): Cookie[]
{
	const merged = new Map<string, Cookie>();

	for (const group of groups)
	{
		for (const cookie of group)
		{
			merged.set(_cookieKey(cookie), cookie);
		}
	}

	return [...merged.values()];
}

/**
 * 合併多份 storageState
 *
 * Cookie 以 {@link mergeCookies} 去重；各 origin 的 localStorage 以 name 去重後合併。
 * 產出的結構與 `browser.newContext({ storageState })` 所需格式一致。
 */
export function mergeStorageStates(states: readonly ISessionState[]): ISessionState
{
	const cookies = mergeCookies(states.map(state => state.cookies ?? []));
	const origins = new Map<string, IOriginState>();

	for (const state of states)
	{
		for (const origin of state.origins ?? [])
		{
			const existing = origins.get(origin.origin);
			const items = new Map<string, string>(
				(existing?.localStorage ?? []).map(item => [item.name, item.value] as [string, string]),
			);

			for (const item of origin.localStorage ?? [])
			{
				items.set(item.name, item.value);
			}

			origins.set(origin.origin, {
				...origin,
				localStorage: [...items].map(([name, value]) => ({ name, value }) as ILocalStorageItem),
			});
		}
	}

	return {
		cookies,
		origins: [...origins.values()],
	};
}
