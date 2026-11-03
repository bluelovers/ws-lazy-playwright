import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from './types';

/** 進度檔格式版本；格式變更時遞增，舊版檔案一律重新開始 */
const PROGRESS_VERSION = 1;

/** 任務進度檔內容（JSON） */
interface IProgressFile
{
	version: number;
	basePath: string;
	range: ITaskRangeOptions;
	done: string[];
	updatedAt: string;
}

/**
 * 任務進度：已完成執行單位的記錄
 *
 * 供中斷或失敗後接續：`has` 於執行前跳過已完成任務，`mark` 於任務完成後立即落盤。
 */
export interface ITaskProgress
{
	/** 該執行單位是否已完成（可跳過） */
	has(path: string): boolean;
	/** 標記執行單位完成並寫入進度檔 */
	mark(path: string): Promise<void>;
}

/**
 * 完整階段：載入任務進度檔，回傳可供 `autoPost` 使用的進度物件
 *
 * 檔案不存在、內容無法解析、或 `basePath` / `range` 與目前呼叫不符時，
 * 一律以空進度（重新開始）處理並記錄，避免套用不相符的舊進度。
 *
 * @param file 進度檔路徑（含檔名）
 * @param basePath 任務基準路徑：作為進度檔所屬執行的識別
 * @param range 任務範圍：同上
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function loadTaskProgress(
	file: string,
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
): Promise<ITaskProgress>
{
	let saved: IProgressFile | undefined;

	try
	{
		saved = JSON.parse(await readFile(file, 'utf8')) as IProgressFile;
	}
	catch
	{
		/** 檔案不存在或內容損毀：視為無進度 */
		saved = undefined;
	}

	let done = new Set<string>();

	if (saved && saved.version === PROGRESS_VERSION
		&& saved.basePath === basePath
		&& JSON.stringify(saved.range) === JSON.stringify(range))
	{
		done = new Set(saved.done);
		_logPhase(EnumPostPhase.AutoPost, options, `progress resumed: ${done.size} done tasks (${file})`);
	}
	else if (saved)
	{
		_logPhase(EnumPostPhase.AutoPost, options, `progress mismatched (version/base/range): start over (${file})`);
	}
	else
	{
		_logPhase(EnumPostPhase.AutoPost, options, `progress starts fresh: no usable file (${file})`);
	}

	return {
		has: path => done.has(path),

		/**
		 * 以「暫存檔 + 改名」寫入：中途失敗或中斷時，
		 * 正式進度檔仍保留上一次的完整內容，不寫入半份資料
		 */
		mark: async (path: string) =>
		{
			done.add(path);

			const payload: IProgressFile = {
				version: PROGRESS_VERSION,
				basePath,
				range,
				done: [...done].sort(),
				updatedAt: new Date().toISOString(),
			};

			await mkdir(dirname(file), { recursive: true });
			await writeFile(`${file}.tmp`, JSON.stringify(payload, undefined, '\t'));
			await rename(`${file}.tmp`, file);

			_logPhase(EnumPostPhase.AutoPost, options, `progress saved: ${done.size} done tasks (${path})`);
		},
	};
}
