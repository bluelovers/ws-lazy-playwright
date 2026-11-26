import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'upath2';
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

	/** 讀取並解析紀錄；檔案不存在或內容非法時回傳 undefined，視為尚未儲存 */
	async read<TPayload>(kind: EnumStorageKind, id: IStorageID): Promise<IStorageRecord<TPayload> | undefined>
	{
		try
		{
			const raw = await readFile(this._file(kind, id), 'utf8');
			return JSON.parse(raw) as IStorageRecord<TPayload>;
		}
		catch
		{
			/** 檔案不存在與解析失敗同樣對應「無紀錄」，不向呼叫端區分失敗原因 */
			return undefined;
		}
	}

	/** 以製表符縮排的 JSON 寫入對應路徑 */
	async write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>
	{
		const file = this._file(record.kind, record.id);
		/** 首次寫入時 kind 目錄尚未建立，先建立目錄再寫檔 */
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, JSON.stringify(record, null, '\t'), 'utf8');
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
