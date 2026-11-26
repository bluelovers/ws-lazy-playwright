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
 * 寫入來源可為 `BrowserContext` 或既有 Cookie 陣列，兩者共用同一寫入流程。
 */
export class CookieStore extends Store<Cookie[], ICookieStoreSourceInput, (cookie: Cookie) => boolean> implements ICookieStore
{
	/** 以指定持久化後端建立 Cookie store */
	constructor(persist: IStoragePersist)
	{
		super(persist, EnumStorageKind.Cookie);
	}

	/**
	 * 以 `cookies()` 是否存在辨別 `BrowserContext` 與純 Cookie 陣列，
	 * 兩種來源統一為 Cookie 陣列，供後續組裝紀錄使用
	 */
	protected async _resolve(source: ICookieStoreSourceInput): Promise<Cookie[]>
	{
		return typeof (source as BrowserContext).cookies === 'function'
			? await (source as BrowserContext).cookies()
			: [...source as readonly Cookie[]];
	}

	/** 以新陣列複製，避免紀錄與來源共用同一參考 */
	protected _clonePayload(payload: Cookie[]): Cookie[]
	{
		return [...payload];
	}

	/** 既有 Cookie 在前、新來源在後，交由 mergeCookies 合併去重 */
	protected _merge(existing: Cookie[], incoming: Cookie[]): Cookie[]
	{
		return mergeCookies([[...existing], [...incoming]]);
	}

	/** 保留符合 predicate 的 Cookie，其餘全數捨棄 */
	protected _filter(payload: Cookie[], predicate: (cookie: Cookie) => boolean): Cookie[]
	{
		return payload.filter(predicate);
	}

	/** 收集各 context 的 Cookie 並合併為單一陣列 */
	protected async _collect(contexts: readonly BrowserContext[]): Promise<Cookie[]>
	{
		const groups = await Promise.all(contexts.map(context => context.cookies()));

		return mergeCookies(groups);
	}

	/** 將已儲存的 Cookie 套用到指定 context，回傳套用筆數 */
	async apply(id: IStorageID, target: BrowserContext): Promise<number>
	{
		const cookies = await this.load(id);
		/** 無紀錄或陣列為空時沒有可套用的 Cookie，視為 0 筆 */
		if (!cookies?.length) return 0;

		await target.addCookies([...cookies]);
		return cookies.length;
	}
}
