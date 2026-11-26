import type { BrowserContext, Cookie } from 'playwright';
import { mergeCookies } from './merge';
import { Store } from './store';
import {
	EnumStorageKind,
	ICookieStoreSourceInput,
	IStorageID,
	type ICookieStore,
	type IStoragePersist,
} from './types';

/**
 * Cookie 儲存與讀取
 *
 * 寫入來源可為 `BrowserContext` 或既有 Cookie 陣列，兩者共用同一寫入流程；
 * 讀寫骨架見 {@link Store}。
 */
export class CookieStore extends Store<Cookie[], ICookieStoreSourceInput, (cookie: Cookie) => boolean> implements ICookieStore
{
	constructor(persist: IStoragePersist)
	{
		super(persist, EnumStorageKind.Cookie);
	}

	/**
	 * 以 `cookies()` 是否存在辨別 `BrowserContext` 與純 Cookie 陣列，
	 * 兩種來源統一為 Cookie 陣列後再寫入
	 */
	protected async _resolve(source: ICookieStoreSourceInput): Promise<Cookie[]>
	{
		return typeof (source as BrowserContext).cookies === 'function'
			? await (source as BrowserContext).cookies()
			: [...source as readonly Cookie[]];
	}

	protected _clonePayload(payload: Cookie[]): Cookie[]
	{
		return [...payload];
	}

	protected _merge(existing: Cookie[], incoming: Cookie[]): Cookie[]
	{
		return mergeCookies([[...existing], [...incoming]]);
	}

	protected _filter(payload: Cookie[], predicate: (cookie: Cookie) => boolean): Cookie[]
	{
		return payload.filter(predicate);
	}

	protected async _collect(contexts: readonly BrowserContext[]): Promise<Cookie[]>
	{
		const groups = await Promise.all(contexts.map(context => context.cookies()));

		return mergeCookies(groups);
	}

	async apply(id: IStorageID, target: BrowserContext): Promise<number>
	{
		const cookies = await this.load(id);
		if (!cookies?.length) return 0;

		await target.addCookies([...cookies]);
		return cookies.length;
	}
}
