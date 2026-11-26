import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'upath2';
import {
	EnumStorageKind,
	type IFileStorageOptions,
	type IStoragePersist,
	type IStorageRecord,
} from './types';

/** 檔案後端的預設根目錄 */
const DEFAULT_BASE_DIR = '.cache/lazy-playwright-impl';

/**
 * 將儲存 id 轉為安全檔名
 *
 * 以 `encodeURIComponent` 轉義路徑分隔符與控制字元，避免 id 造成路徑跳脫；
 * `list()` 以 `decodeURIComponent` 還原，確保 id 可來回轉換。
 */
function _toFileName(id: string): string
{
	return encodeURIComponent(id);
}

/** 檔名還原為儲存 id，與 {@link _toFileName} 成對使用 */
function _toStorageId(fileName: string): string
{
	return decodeURIComponent(fileName);
}

/**
 * 以 JSON 檔案持久化儲存紀錄
 *
 * 目錄結構為 `<baseDir>/<kind>/<id>.json`，`kind` 直接取自 {@link EnumStorageKind}。
 */
export class FileStoragePersist implements IStoragePersist
{
	protected readonly _baseDir: string;

	constructor(options: IFileStorageOptions = {})
	{
		this._baseDir = resolve(options.baseDir ?? DEFAULT_BASE_DIR);
	}

	protected _file(kind: EnumStorageKind, id: string): string
	{
		return join(this._baseDir, kind, `${_toFileName(id)}.json`);
	}

	async read<TPayload>(kind: EnumStorageKind, id: string): Promise<IStorageRecord<TPayload> | undefined>
	{
		try
		{
			const raw = await readFile(this._file(kind, id), 'utf8');
			return JSON.parse(raw) as IStorageRecord<TPayload>;
		}
		catch
		{
			return undefined;
		}
	}

	async write<TPayload>(record: IStorageRecord<TPayload>): Promise<void>
	{
		const file = this._file(record.kind, record.id);
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, JSON.stringify(record, null, '\t'), 'utf8');
	}

	async remove(kind: EnumStorageKind, id: string): Promise<boolean>
	{
		try
		{
			await rm(this._file(kind, id));
			return true;
		}
		catch
		{
			return false;
		}
	}

	async list(kind: EnumStorageKind): Promise<string[]>
	{
		try
		{
			const entries = await readdir(join(this._baseDir, kind));
			return entries
				.filter(entry => entry.endsWith('.json'))
				.map(entry => _toStorageId(entry.slice(0, -'.json'.length)));
		}
		catch
		{
			return [];
		}
	}
}
