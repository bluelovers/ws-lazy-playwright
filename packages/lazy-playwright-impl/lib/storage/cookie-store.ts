import type { BrowserContext, Cookie } from 'playwright';
import { mergeCookies } from './merge';
import {
	EnumStorageKind,
	type ICookieStore,
	type IStoragePersist,
	type IStorageRecord,
} from './types';

/**
 * Cookie 儲存與讀取
 *
 * 寫入來源可為 `BrowserContext` 或既有 Cookie 陣列，兩者共用同一寫入流程。
 */
export class CookieStore implements ICookieStore
{
	protected readonly _persist: IStoragePersist;

	constructor(persist: IStoragePersist)
	{
		this._persist = persist;
	}

	/**
	 * 以 `cookies()` 是否存在辨別 `BrowserContext` 與純 Cookie 陣列，
	 * 兩種來源統一為 Cookie 陣列後再寫入
	 */
	protected async _resolve(source: BrowserContext | readonly Cookie[]): Promise<readonly Cookie[]>
	{
		return typeof (source as BrowserContext).cookies === 'function'
			? await (source as BrowserContext).cookies()
			: source as readonly Cookie[];
	}

	async save(id: string, source: BrowserContext | readonly Cookie[]): Promise<IStorageRecord<Cookie[]>>
	{
		const record: IStorageRecord<Cookie[]> = {
			kind: EnumStorageKind.Cookie,
			id,
			updatedAt: Date.now(),
			payload: [...await this._resolve(source)],
		};

		await this._persist.write(record);
		return record;
	}

	async load(id: string): Promise<Cookie[] | undefined>
	{
		return (await this._persist.read<Cookie[]>(EnumStorageKind.Cookie, id))?.payload;
	}

	async saveAll(id: string, contexts: readonly BrowserContext[]): Promise<IStorageRecord<Cookie[]>>
	{
		const groups = await Promise.all(contexts.map(context => context.cookies()));

		return this.save(id, mergeCookies(groups));
	}

	async apply(id: string, target: BrowserContext): Promise<number>
	{
		const cookies = await this.load(id);
		if (!cookies?.length) return 0;

		await target.addCookies([...cookies]);
		return cookies.length;
	}

	async remove(id: string): Promise<boolean>
	{
		return this._persist.remove(EnumStorageKind.Cookie, id);
	}

	async list(): Promise<string[]>
	{
		return this._persist.list(EnumStorageKind.Cookie);
	}
}
