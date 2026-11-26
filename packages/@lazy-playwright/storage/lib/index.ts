import { CookieStore } from './cookie-store';
import { FileStoragePersist } from './persist';
import { SessionStore } from './session-store';
import type { IBrowserStorageManager, IStorageOptions, IStoragePersist } from './types';

/**
 * 儲存管理器
 *
 * 所有 store 共用單一 {@link IStoragePersist}，讀寫流程只存在於持久化後端，
 * store 各自只負責型別轉換與套用 (Apply) 邏輯。
 */
export class BrowserStorageManager implements IBrowserStorageManager
{
	readonly persist: IStoragePersist;
	readonly cookies: CookieStore;
	readonly sessions: SessionStore;

	constructor(options: IStorageOptions = {})
	{
		this.persist = options.persist ?? new FileStoragePersist(options.file);
		this.cookies = new CookieStore(this.persist);
		this.sessions = new SessionStore(this.persist);
	}
}
