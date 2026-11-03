import type { BrowserContext } from 'playwright';
import {
	EnumStorageKind,
	type ISessionState,
	type ISessionStore,
	type IStoragePersist,
	type IStorageRecord,
} from './types';

/** `storageState().origins` 的單一 origin 項目 */
type IOriginState = NonNullable<ISessionState['origins']>[number];

/**
 * 產生將 origin 的 localStorage 項目寫回頁面的腳本
 *
 * 腳本內自行比對 `location.origin`，確保只在相符的 origin 執行；
 * `addInitScript` 於 context 內每次導航前執行，可覆蓋後續開啟的分頁。
 */
function _buildOriginInitScript(origin: IOriginState): string
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
export class SessionStore implements ISessionStore
{
	protected readonly _persist: IStoragePersist;

	constructor(persist: IStoragePersist)
	{
		this._persist = persist;
	}

	/** 以 `storageState()` 是否存在辨別 `BrowserContext` 與既有的 Session 狀態 */
	protected async _resolve(source: BrowserContext | ISessionState): Promise<ISessionState>
	{
		return typeof (source as BrowserContext).storageState === 'function'
			? await (source as BrowserContext).storageState()
			: source as ISessionState;
	}

	async save(id: string, source: BrowserContext | ISessionState): Promise<IStorageRecord<ISessionState>>
	{
		const state = await this._resolve(source);

		const record: IStorageRecord<ISessionState> = {
			kind: EnumStorageKind.Session,
			id,
			updatedAt: Date.now(),
			payload: {
				cookies: [...(state.cookies ?? [])],
				origins: (state.origins ?? []).map(origin => ({
					...origin,
					localStorage: [...(origin.localStorage ?? [])],
				})),
			},
		};

		await this._persist.write(record);
		return record;
	}

	async load(id: string): Promise<ISessionState | undefined>
	{
		return (await this._persist.read<ISessionState>(EnumStorageKind.Session, id))?.payload;
	}

	async restore(id: string, target: BrowserContext): Promise<boolean>
	{
		const state = await this.load(id);
		if (!state) return false;

		/** Cookie 可立即套用；localStorage 需等頁面導航後才能寫入 */
		if (state.cookies?.length)
		{
			await target.addCookies([...state.cookies]);
		}

		for (const origin of state.origins ?? [])
		{
			if (!origin.localStorage?.length) continue;
			await target.addInitScript(_buildOriginInitScript(origin));
		}

		return true;
	}

	async remove(id: string): Promise<boolean>
	{
		return this._persist.remove(EnumStorageKind.Session, id);
	}

	async list(): Promise<string[]>
	{
		return this._persist.list(EnumStorageKind.Session);
	}
}
