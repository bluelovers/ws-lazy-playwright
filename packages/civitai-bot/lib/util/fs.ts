
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { PathLike } from 'node:fs';
import { dirname } from 'upath2';

export async function fsExists(path: PathLike, opts?: {
	fileOnly?: boolean;
	dirOnly?: boolean;
})
{
	try
	{
		const stats = await stat(path);

		if (opts?.fileOnly && !stats.isFile()) return false;
		if (opts?.dirOnly && !stats.isDirectory()) return false;

		return true;
	}
	catch (error)
	{
		if (error.code === 'ENOENT') return false;
		throw error;
	}
}

/**
 * 以「暫存檔 + 改名」原子寫入 JSON
 *
 * 中途失敗或中斷時，正式檔案仍保留上一次的完整內容，不寫入半份資料。
 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void>
{
	await mkdir(dirname(file), { recursive: true });
	await writeFile(`${file}.tmp`, JSON.stringify(data, undefined, '\t'));
	await rename(`${file}.tmp`, file);
}

/**
 * 讀取 JSON 檔
 *
 * 檔案不存在或內容無法解析時回傳 `undefined`，由呼叫端改以預設值處理。
 */
export async function readJsonFile<T>(file: string): Promise<T | undefined>
{
	return readFile(file, 'utf8')
		.then(text => JSON.parse(text) as T)
		.catch(() => undefined);
}

