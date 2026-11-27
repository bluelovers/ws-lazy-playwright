import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'upath2';
import { outputJSON, readJSON, type IWriteOptions } from '@bluelovers/fs-json';
import {
	EnumStorageKind,
	IFileStorageOptionsInput,
	IStorageID,
	type IFileStorageOptions,
	type IStoragePersist,
	type IStorageRecord,
} from './types';
import { ITSRequireAtLeastOne } from 'ts-type';

/** 檔案後端的預設根目錄 */
const DEFAULT_BASE_DIR = '.cache/lazy-playwright-impl';

/**
 * JSON 寫入選項
 *
 * 以製表符縮排、保留結尾換行（`finalEOL` 為該套件預設值，此處明確寫出以固定格式），
 * 所有紀錄寫入共用此設定，避免格式散落在各呼叫點。
 */
const JSON_WRITE_OPTIONS: IWriteOptions = {
	spaces: '\t',
	finalEOL: true,
};

/**
 * 型別守衛：驗證解析結果具備 {@link IStorageRecord} 骨架
 *
 * 泛型 `T` 直接貫穿守衛，讓驗證通過的值維持 `IStorageRecord<T>` 而無需再轉型；
 * `payload` 內部結構執行期無法驗證，僅確認欄位存在，其餘欄位驗證實際型別。
 */
function _isStorageRecord<T>(value: unknown): value is IStorageRecord<T>
{
	if (typeof value !== 'object' || value === null)
	{
		return false;
	}

	const record = value as Partial<IStorageRecord>;

	return Object.values(EnumStorageKind).includes(record.kind as EnumStorageKind)
		&& typeof record.id === 'string'
		&& typeof record.updatedAt === 'number'
		&& 'payload' in record;
}

/** 區分「檔案不存在（尚未儲存）」與其他真實錯誤，讓只有前者對應無紀錄 */
function _isNotFoundError(error: unknown): boolean
{
	return typeof error === 'object'
		&& error !== null
		&& 'code' in error
		&& error.code === 'ENOENT';
}

/**
 * 將儲存 id 轉為安全檔名
 *
 * 以 `encodeURIComponent` 轉義路徑分隔符與控制字元，避免 id 造成路徑跳脫；
 * `list()` 以 `decodeURIComponent` 還原，確保 id 可來回轉換。
 */
function _toFileName(id: IStorageID): string
{
	return encodeURIComponent(id);
}

/** 檔名還原為儲存 id，與 {@link _toFileName} 成對使用 */
function _toStorageId(fileName: string): string
{
	return decodeURIComponent(fileName);
}

/** 以 cwd 為基準解析預設儲存根目錄；cwd 為空時無法定位目錄，抛出 RangeError */
export function _getFileStoragePersistBaseDir(cwd: string): string
{
	if (!cwd?.length)
	{
		throw new RangeError(`cwd is required: ${cwd}`);
	}

	return resolve(cwd, DEFAULT_BASE_DIR);
}

/**
 * 以 JSON 檔案持久化儲存紀錄
 *
 * 目錄結構為 `<baseDir>/<kind>/<id>.json`，`kind` 直接取自 {@link EnumStorageKind}。
 */
export class FileStoragePersist implements IStoragePersist
{
	/** 儲存根目錄，各儲存類別的目錄皆位於其下 */
	protected readonly _baseDir: string;

	/** 未指定 baseDir 時以 cwd 推導預設根目錄 */
	constructor(options: IFileStorageOptionsInput)
	{
		this._baseDir = resolve(options.baseDir ?? _getFileStoragePersistBaseDir(options.cwd));
	}

	/** 組出單一紀錄的檔案路徑：id 經 {@link _toFileName} 轉為安全檔名後置於 kind 目錄下 */
	protected _file(kind: EnumStorageKind, id: IStorageID): string
	{
		return join(this._baseDir, kind, `${_toFileName(id)}.json`);
	}

	/**
	 * 讀取並解析紀錄
	 *
	 * 檔案不存在對應「尚未儲存」，回傳 undefined；
	 * JSON 內容非法或骨架 / `kind` 不符一律抛錯，避免損壞資料被靜默當作無紀錄。
	 */
	async read<TPayload>(kind: EnumStorageKind, id: IStorageID): Promise<IStorageRecord<TPayload> | undefined>
	{
		const file = this._file(kind, id);

		let record: IStorageRecord<TPayload>;

		try
		{
			record = await readJSON<IStorageRecord<TPayload>>(file);
		}
		catch (error)
		{
			if (_isNotFoundError(error))
			{
				return undefined;
			}

			/** JSON 解析失敗等真實錯誤直接上抛，不吞成「無紀錄」 */
			throw error;
		}

		if (!_isStorageRecord<TPayload>(record))
		{
			throw new SyntaxError(`Invalid storage record: ${file}`);
		}

		if (record.kind !== kind)
		{
			throw new SyntaxError(`Storage record kind mismatch: expected ${kind}, got ${String(record.kind)} (${file})`);
		}

		return record;
	}

	/** 以製表符縮排的 JSON 寫入對應路徑 */
	async write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>
	{
		const file = this._file(record.kind, record.id);
		/** `outputJSON` 於目錄尚未建立時會自動建目錄，免去先 `mkdir` 再寫檔 */
		await outputJSON<IStorageRecord<TPayload>>(file, record, JSON_WRITE_OPTIONS);
	}

	/** 移除紀錄；檔案不存在等失敗情形回傳 false */
	async remove(kind: EnumStorageKind, id: IStorageID): Promise<boolean>
	{
		try
		{
			await rm(this._file(kind, id));
			return true;
		}
		catch
		{
			/** `rm` 對不存在的檔案會抛錯，失敗即視為未移除 */
			return false;
		}
	}

	/** 列出儲存類別下的所有儲存 id；目錄尚未建立時回傳空陣列 */
	async list(kind: EnumStorageKind): Promise<string[]>
	{
		try
		{
			const entries = await readdir(join(this._baseDir, kind));
			/** 只取 `.json` 紀錄檔，去掉副檔名後還原為儲存 id，排除目錄內雜物 */
			return entries
				.filter(entry => entry.endsWith('.json'))
				.map(entry => _toStorageId(entry.slice(0, -'.json'.length)));
		}
		catch
		{
			/** 目錄尚未建立（尚未寫入過）時對應「無任何紀錄」 */
			return [];
		}
	}
}
