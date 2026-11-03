import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type IUploadItem } from './types';

/** 進度檔格式版本；格式變更時遞增，舊版檔案一律重新開始 */
const PROGRESS_VERSION = 1;

/** 單一單位的中斷檢查點 (Checkpoint)：執行到一半的實際進度 */
export interface ITaskCheckpoint
{
	/** 執行單位路徑 */
	path: string;
	/** 剩餘待執行佇列（批次切分後的餘額） */
	remaining: IUploadItem[];
	/** 已進行到的批次序號：續跑時由此接續 */
	batchNo: number;
	/** 該單位已取得的發布網址：續跑時併回完成紀錄 */
	publishedUrls: string[];
}

/** 任務進度檔內容（JSON） */
interface IProgressFile
{
	version: number;
	basePath: string;
	done: string[];
	checkpoint?: ITaskCheckpoint;
	updatedAt: string;
}

/**
 * 任務進度：執行單位的完成記錄與中斷檢查點 (Checkpoint)
 *
 * 供中斷或失敗後接續：`has` 於執行前跳過已完成任務，
 * `saveCheckpoint` 於每批完成後保存實際進度，`mark` 於單位完成後標記並清除其檢查點。
 */
export interface ITaskProgress
{
	/** 已完成任務數：供呼叫端判斷是否有可接續的完成紀錄 */
	readonly size: number;
	/** 是否存有中斷檢查點：有即代表尚有進行到一半的單位 */
	readonly hasCheckpoint: boolean;
	/** 該執行單位是否已完成（可跳過） */
	has(path: string): boolean;
	/** 取得該單位的中斷檢查點；非該單位或無檢查點時回傳 `undefined` */
	checkpoint(path: string): ITaskCheckpoint | undefined;
	/** 保存中斷檢查點並立即落盤：供下次自實際進度續跑，不重跑整個單位 */
	saveCheckpoint(state: ITaskCheckpoint): Promise<void>;
	/** 標記執行單位完成（清除其檢查點）並寫入進度檔 */
	mark(path: string): Promise<void>;
}

/**
 * 完整階段：載入任務進度檔，回傳可供 `autoPost` 使用的進度物件
 *
 * 檔案不存在、內容無法解析、或 `basePath` 與目前呼叫不符時，
 * 一律以空進度（重新開始）處理並記錄，避免套用不相符的舊進度。
 *
 * 進度以「已完成任務路徑」為準，不因任務範圍（`range` / CLI 參數）改變而重置：
 * 範圍不同的執行依舊跳過已完成任務。
 *
 * 另含單一中斷檢查點：記錄正在執行單位的剩餘佇列，
 * 使大目錄中斷後自實際進度續跑，不從頭重跑。
 *
 * @param file 進度檔路徑（含檔名）
 * @param basePath 任務基準路徑：作為進度檔所屬執行的識別
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function loadTaskProgress(
	file: string,
	basePath: string,
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
	let checkpoint: ITaskCheckpoint | undefined;

	if (saved && saved.version === PROGRESS_VERSION && saved.basePath === basePath)
	{
		done = new Set(saved.done);
		checkpoint = Array.isArray(saved.checkpoint?.remaining) ? saved.checkpoint : undefined;

		_logPhase(
			EnumPostPhase.AutoPost,
			options,
			`progress resumed: ${done.size} done tasks`
			+ `${checkpoint ? `, checkpoint batch ${checkpoint.batchNo} (${checkpoint.path})` : ''}`
			+ ` (${file})`,
		);
	}
	else if (saved)
	{
		_logPhase(EnumPostPhase.AutoPost, options, `progress mismatched (version/base): start over (${file})`);
	}
	else
	{
		_logPhase(EnumPostPhase.AutoPost, options, `progress starts fresh: no usable file (${file})`);
	}

	/** 進度檔寫入：暫存檔 + 改名，中途失敗或中斷時正式檔案保留上一次的完整內容 */
	const write = async (): Promise<void> =>
	{
		const payload: IProgressFile = {
			version: PROGRESS_VERSION,
			basePath,
			done: [...done].sort(),
			checkpoint,
			updatedAt: new Date().toISOString(),
		};

		await mkdir(dirname(file), { recursive: true });
		await writeFile(`${file}.tmp`, JSON.stringify(payload, undefined, '\t'));
		await rename(`${file}.tmp`, file);
	};

	return {
		get size(): number
		{
			return done.size;
		},

		get hasCheckpoint(): boolean
		{
			return checkpoint !== undefined;
		},

		has: path => done.has(path),

		checkpoint: path => (checkpoint && checkpoint.path === path ? checkpoint : undefined),

		saveCheckpoint: async (state: ITaskCheckpoint) =>
		{
			checkpoint = state;
			await write();

			_logPhase(
				EnumPostPhase.AutoPost,
				options,
				`progress checkpoint: batch ${state.batchNo}, ${state.remaining.length} left (${state.path})`,
			);
		},

		mark: async (path: string) =>
		{
			done.add(path);

			/** 標記完成即清除同單位檢查點：該單位已無待執行佇列 */
			if (checkpoint?.path === path)
			{
				checkpoint = undefined;
			}

			await write();
			_logPhase(EnumPostPhase.AutoPost, options, `progress saved: ${done.size} done tasks (${path})`);
		},
	};
}
