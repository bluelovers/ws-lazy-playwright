import type { BrowserContext } from 'playwright';
import {
	EnumStorageKind,
	IStorageID,
	type IStoragePersist,
	type IStorageRecord,
	type IStore,
} from './types';

/**
 * Store 通用實作骨架 (Base Store Implementation)
 *
 * `CookieStore` 與 `SessionStore` 共用的讀寫流程，
 * 型別專屬差異以抽象方法保留：來源還原、payload 複製、合併、過濾與多 context 收集。
 * 
 * `TPayload extends TSource`：payload 本身即為合法來源，`add` / `saveAll` 合併後可直接交給 `build` / `save`
 */
export abstract class Store<TPayload extends TSource, TSource, TPredicate> implements IStore<TPayload, TSource, TPredicate>
{
	protected readonly _persist: IStoragePersist;
	protected readonly _kind: EnumStorageKind;

	constructor(persist: IStoragePersist, kind: EnumStorageKind)
	{
		this._persist = persist;
		this._kind = kind;
	}

	/** 辨別 `BrowserContext` 與既有 payload，統一為該 store 的 payload */
	protected abstract _resolve(source: TSource): Promise<TPayload>;

	/** 複製並補齊 payload 欄位，避免紀錄持有來源的陣列參考 */
	protected abstract _clonePayload(payload: TPayload): TPayload;

	/** 將新 payload 併入既有 payload */
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

	async build(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		return this._record(id, this._clonePayload(await this._resolve(source)));
	}

	async save(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		const record = await this.build(id, source);

		await this._persist.write(record);
		return record;
	}

	async add(id: IStorageID, source: TSource): Promise<IStorageRecord<TPayload>>
	{
		const [existing, incoming] = await Promise.all([
			this.load(id),
			this._resolve(source),
		]);

		return this.build(id, existing ? this._merge(existing, incoming) : incoming);
	}

	async filter(id: IStorageID, predicate: TPredicate): Promise<IStorageRecord<TPayload> | undefined>
	{
		const record = await this._persist.read<TPayload>(this._kind, id);
		if (!record) return undefined;

		return {
			...record,
			payload: this._filter(record.payload, predicate),
		};
	}

	async load(id: IStorageID): Promise<TPayload | undefined>
	{
		return (await this._persist.read<TPayload>(this._kind, id))?.payload;
	}

	async saveAll(id: IStorageID, contexts: readonly BrowserContext[]): Promise<IStorageRecord<TPayload>>
	{
		return this.save(id, await this._collect(contexts));
	}

	async remove(id: IStorageID): Promise<boolean>
	{
		return this._persist.remove(this._kind, id);
	}

	async list(): Promise<string[]>
	{
		return this._persist.list(this._kind);
	}
}
