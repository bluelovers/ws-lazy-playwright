/// <reference types="node" />
import type { Cookie } from 'playwright';
import { EnumStorageKind } from '@lazy-playwright/storage/lib/types';
import type { IStoragePersist, IStorageRecord, ISessionState } from '@lazy-playwright/storage/lib/types';

/** 測試用儲存 id */
export const __TEST_STORAGE_ID = 'default';

/** 測試用固定 updatedAt（epoch milliseconds） */
export const __TEST_UPDATED_AT = 1795060112676;

/** 建立測試用 Cookie，可覆寫個別欄位 */
export function _createTestCookie(overrides: Partial<Cookie> = {}): Cookie
{
	return {
		name: 'cookie',
		value: 'value',
		domain: '.example.com',
		path: '/',
		expires: 1893456000,
		httpOnly: false,
		secure: false,
		sameSite: 'Lax',
		...overrides,
	};
}

/** 建立測試用 Session 狀態 */
export function _createTestSessionState(overrides: Partial<ISessionState> = {}): ISessionState
{
	return {
		cookies: [],
		origins: [],
		...overrides,
	};
}

/** 建立測試用儲存紀錄，預設 id 與 updatedAt 為測試常數 */
export function _createTestRecord<TPayload>(
	kind: EnumStorageKind,
	payload: TPayload,
	overrides: Partial<IStorageRecord<TPayload>> = {},
): IStorageRecord<TPayload>
{
	return {
		kind,
		id: __TEST_STORAGE_ID,
		updatedAt: __TEST_UPDATED_AT,
		payload,
		...overrides,
	};
}

/** 記憶體持久化後端：記錄每次 write，供斷言「不寫入」行為 */
export interface IFakeStoragePersist extends IStoragePersist
{
	/** write 呼叫過的紀錄（依呼叫順序） */
	readonly writes: readonly IStorageRecord[];
}

/** 建立記憶體持久化後端；可傳入種子紀錄作為既有資料 */
export function _createFakeStoragePersist(seed: readonly IStorageRecord[] = []): IFakeStoragePersist
{
	const records = new Map<string, IStorageRecord>();

	for (const record of seed)
	{
		records.set(`${record.kind}/${record.id}`, record);
	}

	const writes: IStorageRecord[] = [];

	return {
		writes,
		async read<TPayload>(kind: EnumStorageKind, id: string): Promise<IStorageRecord<TPayload> | undefined>
		{
			return records.get(`${kind}/${id}`) as IStorageRecord<TPayload> | undefined;
		},
		async write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>
		{
			records.set(`${record.kind}/${record.id}`, record);
			writes.push(record);
		},
		async remove(kind: EnumStorageKind, id: string): Promise<boolean>
		{
			return records.delete(`${kind}/${id}`);
		},
		async list(kind: EnumStorageKind): Promise<string[]>
		{
			const prefix = `${kind}/`;

			return [...records.keys()]
				.filter(key => key.startsWith(prefix))
				.map(key => key.slice(prefix.length));
		},
	};
}
