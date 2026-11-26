import type { BrowserContext, Cookie } from 'playwright';
import { ITSRequireAtLeastOne } from 'ts-type';

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

/** `storageState().origins` 的單一 origin 項目 */
export type IOriginState = NonNullable<ISessionState['origins']>[number];

export type ILocalStorageItem = NonNullable<IOriginState['localStorage']>[number];

/** 經持久化後的儲存紀錄 */
export interface IStorageRecord<TPayload = unknown>
{
	kind: EnumStorageKind;
	id: IStorageID;
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
	read<TPayload>(kind: EnumStorageKind, id: IStorageID): Promise<IStorageRecord<TPayload> | undefined>;
	write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>;
	remove(kind: EnumStorageKind, id: IStorageID): Promise<boolean>;
	list(kind: EnumStorageKind): Promise<string[]>;
}

export type ICookieStoreSourceInput = BrowserContext | readonly Cookie[];

/** Cookie 存取契約 */
export interface ICookieStore
{
	/** 還原來源並組裝將被寫入的紀錄；`save` 的核心流程，不執行 write */
	build(id: IStorageID, source: ICookieStoreSourceInput): Promise<IStorageRecord<Cookie[]>>;
	save(id: IStorageID, source: ICookieStoreSourceInput): Promise<IStorageRecord<Cookie[]>>;
	/** 併入既有紀錄後回傳新紀錄（尚無紀錄時等同 `build`）；不執行 write，需持久化時以 `save(id, record.payload)` 寫入 */
	add(id: IStorageID, source: ICookieStoreSourceInput): Promise<IStorageRecord<Cookie[]>>;
	/** 依條件過濾既有紀錄並回傳（保留原 updatedAt）；不執行 write，尚無紀錄時回傳 undefined */
	filter(id: IStorageID, predicate: (cookie: Cookie) => boolean): Promise<IStorageRecord<Cookie[]> | undefined>;
	load(id: IStorageID): Promise<Cookie[] | undefined>;
	/** 將已儲存的 Cookie 套用到指定 context，回傳套用筆數 */
	apply(id: IStorageID, target: BrowserContext): Promise<number>;
	/** 從多個 context 收集所有 Cookie，去重後儲存 */
	saveAll(id: IStorageID, contexts: readonly BrowserContext[]): Promise<IStorageRecord<Cookie[]>>;
	remove(id: IStorageID): Promise<boolean>;
	list(): Promise<string[]>;
}

/** Session 過濾條件；未提供的條件代表該類項目全數保留 */
export interface ISessionFilterPredicates
{
	/** Cookie 條件 */
	cookie?: (cookie: Cookie) => boolean;
	/** origin 條件（連同其 localStorage 一併過濾） */
	origin?: (origin: IOriginState) => boolean;
}

export type ISessionStoreSourceInput = BrowserContext | ISessionState;

/** Session 存取契約 */
export interface ISessionStore
{
	/** 還原來源並組裝將被寫入的紀錄；`save` 的核心流程，不執行 write */
	build(id: IStorageID, source: ISessionStoreSourceInput): Promise<IStorageRecord<ISessionState>>;
	save(id: IStorageID, source: ISessionStoreSourceInput): Promise<IStorageRecord<ISessionState>>;
	/** 併入既有紀錄（cookies 與 origins 皆合併）後回傳新紀錄（尚無紀錄時等同 `build`）；不執行 write，需持久化時以 `save(id, record.payload)` 寫入 */
	add(id: IStorageID, source: ISessionStoreSourceInput): Promise<IStorageRecord<ISessionState>>;
	/** 依條件過濾既有紀錄的 cookies 與 origins 並回傳（保留原 updatedAt）；不執行 write，尚無紀錄時回傳 undefined */
	filter(id: IStorageID, predicates: ISessionFilterPredicates): Promise<IStorageRecord<ISessionState> | undefined>;
	load(id: IStorageID): Promise<ISessionState | undefined>;
	/** 將已儲存的 Session 還原到指定 context；origin 內容於後續導航時注入 */
	restore(id: IStorageID, target: BrowserContext): Promise<boolean>;
	/** 從多個 context 收集 storageState，合併後儲存；結果可直接作為 `newContext` 的 `storageState` */
	saveAll(id: IStorageID, contexts: readonly BrowserContext[]): Promise<IStorageRecord<ISessionState>>;
	remove(id: IStorageID): Promise<boolean>;
	list(): Promise<string[]>;
}

/** 檔案後端設定 */
export interface IFileStorageOptions
{
	/** 儲存根目錄 */
	baseDir?: string;
	/** 當前工作目錄，當 baseDir 未指定時，必須提供此參數 */
	cwd?: string;
}

export type IFileStorageOptionsInput = ITSRequireAtLeastOne<IFileStorageOptions>;

/** 未指定儲存 id 時使用的預設識別 */
export const DEFAULT_STORAGE_ID = 'default';

export type IStorageID = typeof DEFAULT_STORAGE_ID | (string & {});

/** 登入狀態自動還原設定 */
export interface IStorageRestoreOptions
{
	/** 儲存 id；未指定時使用 {@link DEFAULT_STORAGE_ID} */
	id?: IStorageID;
}

/** 儲存機制設定 */
export interface IStorageOptions
{
	/** 自訂持久化後端；未提供時使用檔案後端 */
	persist?: IStoragePersist;
	/** 檔案後端設定 */
	fileStorageOptions?: IFileStorageOptionsInput;
	/**
	 * 建立 context 時自動還原登入狀態（Cookie 與 Session），免於呼叫端自行組裝還原流程
	 *
	 * `true` 使用預設 id；未提供時不還原。
	 * 尚未儲存過時僅記錄，後續頁面會以未登入狀態開啟。
	 */
	restore?: boolean | IStorageRestoreOptions;
}

/** 儲存管理器：彙整各類 store 並共用同一持久化後端 */
export interface IBrowserStorageManager
{
	readonly persist: IStoragePersist;
	readonly cookies: ICookieStore;
	readonly sessions: ISessionStore;
}

