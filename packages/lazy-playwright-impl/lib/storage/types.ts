import type { BrowserContext, Cookie } from 'playwright';

/** 儲存類別 (Storage Kind)：決定紀錄的分類與存放位置 */
export enum EnumStorageKind
{
	/** Cookie 集合 */
	Cookie = 'cookie',
	/** Session 狀態：Cookie 與各 origin 的 localStorage，等同 `BrowserContext.storageState()` */
	Session = 'session',
	/** 單一 origin 的 localStorage（預留） */
	LocalStorage = 'local_storage',
	/** 單一 origin 的 sessionStorage（預留） */
	SessionStorage = 'session_storage',
}

/** Session 狀態型別：直接取自 `BrowserContext.storageState()` 的回傳值，不另行定義副本 */
export type ISessionState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** 經持久化後的儲存紀錄 */
export interface IStorageRecord<TPayload = unknown>
{
	kind: EnumStorageKind;
	id: string;
	updatedAt: number;
	payload: TPayload;
}

/**
 * 持久化契約 (Persistence Contract)
 *
 * 所有 store 共用的讀寫介面，替換儲存後端時不需變更 store 實作。
 */
export interface IStoragePersist
{
	read<TPayload>(kind: EnumStorageKind, id: string): Promise<IStorageRecord<TPayload> | undefined>;
	write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>;
	remove(kind: EnumStorageKind, id: string): Promise<boolean>;
	list(kind: EnumStorageKind): Promise<string[]>;
}

/** Cookie 存取契約 */
export interface ICookieStore
{
	save(id: string, source: BrowserContext | readonly Cookie[]): Promise<IStorageRecord<Cookie[]>>;
	load(id: string): Promise<Cookie[] | undefined>;
	/** 將已儲存的 Cookie 套用到指定 context，回傳套用筆數 */
	apply(id: string, target: BrowserContext): Promise<number>;
	/** 從多個 context 收集所有 Cookie，去重後儲存 */
	saveAll(id: string, contexts: readonly BrowserContext[]): Promise<IStorageRecord<Cookie[]>>;
	remove(id: string): Promise<boolean>;
	list(): Promise<string[]>;
}

/** Session 存取契約 */
export interface ISessionStore
{
	save(id: string, source: BrowserContext | ISessionState): Promise<IStorageRecord<ISessionState>>;
	load(id: string): Promise<ISessionState | undefined>;
	/** 將已儲存的 Session 還原到指定 context；origin 內容於後續導航時注入 */
	restore(id: string, target: BrowserContext): Promise<boolean>;
	/** 從多個 context 收集 storageState，合併後儲存；結果可直接作為 `newContext` 的 `storageState` */
	saveAll(id: string, contexts: readonly BrowserContext[]): Promise<IStorageRecord<ISessionState>>;
	remove(id: string): Promise<boolean>;
	list(): Promise<string[]>;
}

/** 檔案後端設定 */
export interface IFileStorageOptions
{
	/** 儲存根目錄 */
	baseDir?: string;
}

/** 儲存機制設定 */
export interface IStorageOptions
{
	/** 自訂持久化後端；未提供時使用檔案後端 */
	persist?: IStoragePersist;
	/** 檔案後端設定 */
	file?: IFileStorageOptions;
}

/** 儲存管理器：彙整各類 store 並共用同一持久化後端 */
export interface IBrowserStorageManager
{
	readonly persist: IStoragePersist;
	readonly cookies: ICookieStore;
	readonly sessions: ISessionStore;
}
