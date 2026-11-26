import type { BrowserContext } from 'playwright';
import {
	EnumStorageKind,
	IStorageID,
	type IStoragePersist,
	type IStorageRecord,
	type IStore,
} from './types';

/**
 * `CookieStore` 與 `SessionStore` 共用的讀寫流程：
 * 型別專屬差異（來源還原、payload 複製、合併、過濾、多 context 收集）以抽象方法交由子類別實作。
 *
 * `TPayload extends TSource`：payload 本身即為合法來源，`add` / `saveAll` 合併後的結果可直接交給 `build` / `save`。
 */
export abstract class Store<TPayload extends TSource, TSource, TPredicate> implements IStore<TPayload, TSource, TPredicate>
{
	/** 持久化後端，本 store 的一切讀寫皆經由此介面 */
	protected readonly _persist: IStoragePersist;
	/** 所屬儲存類別 (Storage Kind)，決定紀錄的目錄與 id 空間 */
	protected readonly _kind: EnumStorageKind;

	/** 以持久化後端與所屬儲存類別建立 store */
	constructor(persist: IStoragePersist, kind: EnumStorageKind)
	{
		this._persist = persist;
		this._kind = kind;
	}

	/** 辨別 `BrowserContext` 與既有 payload，統一為該 store 的 payload */
	protected abstract _resolve(source: TSource): Promise<TPayload>;

	/** 複製並補齊 payload 欄位，避免紀錄持有來源的陣列參考 */
	protected abstract _clonePayload(payload: TPayload): TPayload;

	/** 將新 payload 併入既有 payload；合併順序為既有在前、新來源在後 */
	protected abstract _merge(existing: TPayload, incoming: TPayload): TPayload;

	/** 依條件過濾 payload */
	protected abstract _filter(payload: TPayload, predicate: TPredicate): TPayload;

	/** 從多個 context 收集並合併為 payload */
	protected abstract _collect(contexts: readonly BrowserContext[]): Promise<TPayload>;

	/** 以當前 kind 組裝將被寫入的紀錄 */
	protected _record(id: IStorageID, payload: TPayload): IStorageRecord<TPayload>
	{
		return {
			kind: this._kind,
			id,
			updatedAt: Date.now(),
			payload,
		};
	}

	/** 還原來源並組裝新紀錄（`save` 的核心流程）；不執行 write */
	async build(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		return this._record(id, this._clonePayload(await this._resolve(source)));
	}

	/** 組裝新紀錄並交由持久化後端寫入，回傳該紀錄 */
	async save(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		const record = await this.build(id, source);

		await this._persist.write(record);
		return record;
	}

	/**
	 * 讀取既有紀錄併入新來源後組裝新紀錄（無紀錄時等同 `build`）；
	 * 不執行 write，
	 * 需持久化時以 `save(id, record.payload)` 寫入
	 */
	async add(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		const [existing, incoming] = await Promise.all([
			this.load(id),
			this._resolve(source),
		]);

		/** 無既有紀錄時沒有可合併的對象，新來源即為最終 payload */
		return this.build(id, existing ? this._merge(existing, incoming) : incoming);
	}

	/**
	 * 讀取既有紀錄並依條件過濾後回傳（保留原 updatedAt）；
	 * 不執行 write，
	 * 無紀錄時回傳 undefined
	 */
	async filter(id: IStorageID, predicate: TPredicate): Promise<IStorageRecord<TPayload> | undefined>
	{
		const record = await this._persist.read<TPayload>(this._kind, id);
		/** 無紀錄時沒有可過濾的 payload */
		if (!record) return undefined;

		return {
			...record,
			payload: this._filter(record.payload, predicate),
		};
	}

	/** 讀取已儲存的 payload；無紀錄時回傳 undefined */
	async load(id: IStorageID): Promise<TPayload | undefined>
	{
		return (await this._persist.read<TPayload>(this._kind, id))?.payload;
	}

	/** 從多個 context 收集並合併後寫入，結果可直接作為紀錄 payload */
	async saveAll(id: IStorageID, contexts: readonly BrowserContext[]): Promise<IStorageRecord<TPayload>>
	{
		return this.save(id, await this._collect(contexts));
	}

	/** 移除指定 id 的紀錄；不存在或移除失敗回傳 false */
	async remove(id: IStorageID): Promise<boolean>
	{
		return this._persist.remove(this._kind, id);
	}

	/** 列出當前儲存類別下所有儲存 id */
	async list(): Promise<string[]>
	{
		return this._persist.list(this._kind);
	}
}
