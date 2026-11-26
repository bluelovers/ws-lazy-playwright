import type { BrowserContext } from 'playwright';
import { mergeStorageStates } from './merge';
import { Store } from './store';
import {
	EnumStorageKind,
	ISessionStoreSourceInput,
	IStorageID,
	type IOriginState,
	type ISessionFilterPredicates,
	type ISessionState,
	type ISessionStore,
	type IStoragePersist,
} from './types';

/**
 * 產生將 origin 的 localStorage 項目寫回頁面的腳本
 *
 * 腳本內自行比對 `location.origin`，確保只在相符的 origin 執行；
 * `addInitScript` 於 context 內每次導航前執行，可覆蓋後續開啟的分頁。
 */
export function _buildOriginInitScript(origin: IOriginState): string
{
	const entries = JSON.stringify(origin.localStorage ?? []);

	return `(() => {`
		+ `if (location.origin !== ${JSON.stringify(origin.origin)}) return;`
		+ `try { const s = window.localStorage; for (const [k, v] of ${entries}) s.setItem(k, v); } catch {}`
		+ `})();`;
}

/**
 * Session 儲存與讀取
 *
 * Session 等同 Playwright 的 storage state（Cookie + 各 origin 的 localStorage），
 * 直接沿用該結構作為儲存格式。
 */
export class SessionStore extends Store<ISessionState, ISessionStoreSourceInput, ISessionFilterPredicates> implements ISessionStore
{
	/** 以指定持久化後端建立 Session store */
	constructor(persist: IStoragePersist)
	{
		super(persist, EnumStorageKind.Session);
	}

	/** 以 `storageState()` 是否存在辨別 `BrowserContext` 與既有的 Session 狀態 */
	protected async _resolve(source: ISessionStoreSourceInput): Promise<ISessionState>
	{
		return typeof (source as BrowserContext).storageState === 'function'
			? await (source as BrowserContext).storageState()
			: source as ISessionState;
	}

	/** 複製 cookies 與各 origin 的 localStorage；缺失欄位補為空陣列，避免紀錄持有來源參考 */
	protected _clonePayload(payload: ISessionState): ISessionState
	{
		return {
			cookies: [...(payload.cookies ?? [])],
			origins: (payload.origins ?? []).map(origin => ({
				...origin,
				localStorage: [...(origin.localStorage ?? [])],
			})),
		};
	}

	/** 既有 Session 在前、新來源在後，交由 mergeStorageStates 合併 cookies 與 origins */
	protected _merge(existing: ISessionState, incoming: ISessionState): ISessionState
	{
		return mergeStorageStates([existing, incoming]);
	}

	/** cookie 與 origin 條件各自過濾；未提供條件的項目全數保留 */
	protected _filter(payload: ISessionState, predicates: ISessionFilterPredicates): ISessionState
	{
		const { cookie, origin } = predicates;
		const cookies = payload.cookies ?? [];
		const origins = payload.origins ?? [];

		return {
			...payload,
			cookies: cookie ? cookies.filter(cookie) : [...cookies],
			origins: origin ? origins.filter(origin) : [...origins],
		};
	}

	/** 收集各 context 的 storageState 並合併為單一狀態 */
	protected async _collect(contexts: readonly BrowserContext[]): Promise<ISessionState>
	{
		const states = await Promise.all(contexts.map(context => context.storageState()));

		return mergeStorageStates(states);
	}

	/** 將已儲存的 Session 還原到指定 context；未儲存過時回傳 false */
	async restore(id: IStorageID, target: BrowserContext): Promise<boolean>
	{
		const state = await this.load(id);
		/** 無紀錄時沒有可還原的內容 */
		if (!state) return false;

		/** Cookie 可立即套用；localStorage 需等頁面導航後才能寫入 */
		if (state.cookies?.length)
		{
			await target.addCookies([...state.cookies]);
		}

		for (const origin of state.origins ?? [])
		{
			/** 無 localStorage 的 origin 沒有可注入的項目 */
			if (!origin.localStorage?.length) continue;
			await target.addInitScript(_buildOriginInitScript(origin));
		}

		return true;
	}
}
