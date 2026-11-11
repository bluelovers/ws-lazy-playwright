import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type IUploadItem } from './types';

/** 進度檔格式版本；格式變更時遞增，舊版檔案一律重新開始 */
const PROGRESS_VERSION = 2;

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
	/** 該輪已發布次數：限量發布續跑時接續計數（舊檢查點可省略） */
	publishCount?: number;
}

/** 完成邊界：完成時的最後處理檔案與時間戳，供重跑比對新增檔案 */
export interface IDoneBoundary
{
	/** 完成時處理的最後一個檔案 */
	lastFile: string;
	/** 該檔案時間戳（mtimeMs）：邊界檔案已被刪除時的比對依據（雙保險） */
	lastFileTime: number;
}

/** 完成記錄：執行單位與其完成邊界 */
export interface IDoneEntry extends IDoneBoundary
{
	/** 執行單位路徑 */
	path: string;
}

/** 任務進度檔內容（JSON） */
interface IProgressFile
{
	version: number;
	basePath: string;
	done: IDoneEntry[];
	checkpoint?: ITaskCheckpoint;
	updatedAt: string;
}

/**
 * 任務進度：執行單位的完成記錄（含完成邊界）與中斷檢查點 (Checkpoint)
 *
 * 供中斷或失敗後接續：`done` 於執行前比對新增檔案，
 * `saveCheckpoint` 於每批確認發布後保存實際進度，`mark` 於單位完成後記錄完成邊界並清除其檢查點；
 * `seed` 由外部紀錄（完成紀錄）批量補齊進度缺漏的完成邊界。
 */
export interface ITaskProgress
{
	/** 已完成任務數：供呼叫端判斷是否有可接續的完成紀錄 */
	readonly size: number;
	/** 是否存有中斷檢查點：有即代表尚有進行到一半的單位 */
	readonly hasCheckpoint: boolean;
	/** 完成記錄（含完成邊界）；未完成時回傳 `undefined` */
	done(path: string): IDoneEntry | undefined;
	/** 取得該單位的中斷檢查點；非該單位或無檢查點時回傳 `undefined` */
	checkpoint(path: string): ITaskCheckpoint | undefined;
	/** 保存中斷檢查點並立即落盤：供下次自實際進度續跑，不重跑整個單位 */
	saveCheckpoint(state: ITaskCheckpoint): Promise<void>;
	/** 標記執行單位完成：記錄完成邊界、清除其檢查點並寫入進度檔 */
	mark(path: string, boundary: IDoneBoundary): Promise<void>;
	/** 批量補入完成邊界（僅補進度缺少的路徑，單次落盤）：由完成紀錄補齊進度缺漏 */
	seed(entries: readonly IDoneEntry[]): Promise<void>;
}

/**
 * 完整階段：自完成邊界比對單位的新增檔案
 *
 * 以完成時的最後處理檔案定位：其在上傳順序中之後者即為新增；
 * 該檔案已不存在（被刪除）時退回時間戳比對——取 mtime 晚於邊界時間戳者（雙保險）。
 *
 * @param order 目前掃描的完整上傳順序（`collectUploadOrder` 結果）
 * @param entry 該單位的完成記錄（含完成邊界）
 */
export function findAddedFiles(order: readonly IUploadItem[], entry: IDoneEntry): IUploadItem[]
{
	const index = order.findIndex(item => item.path === entry.lastFile);

	if (index >= 0)
	{
		/** 邊界檔案仍在：上傳順序位於其之後者即為新增 */
		return order.slice(index + 1);
	}

	/** 邊界檔案已刪除：以時間戳比對（雙保險） */
	return order.filter(item => item.mtime > entry.lastFileTime);
}

/**
 * 完整階段：載入任務進度檔，回傳可供 `autoPost` 使用的進度物件
 *
 * 檔案不存在、內容無法解析、或 `basePath` 與目前呼叫不符時，
 * 一律以空進度（重新開始）處理並記錄，避免套用不相符的舊進度。
 *
 * 進度以「已完成任務路徑」為準，不因任務範圍（`range` / CLI 參數）改變而重置：
 * 範圍不同的執行依舊比對完成紀錄。
 *
 * 完成記錄含完成邊界（最後處理檔案 + 時間戳）：已完成單位重跑時比對新增檔案；
 * 另含單一中斷檢查點：記錄正在執行單位的剩餘佇列，使大目錄中斷後自實際進度續跑。
 *
 * @param file 進度檔路徑（含檔名）
 * @param basePath 任務基準路徑：作為進度檔所屬執行的識別
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @throws {TypeError} 未輸入 `basePath`（undefined / 空字串 / 僅空白）時拋出：
 *   缺少識別基準將無法判定進度所屬執行，不得載入或寫入進度檔
 */
export async function loadTaskProgress(
	file: string,
	basePath: string,
	options?: IMessageOptions,
): Promise<ITaskProgress>
{
	/** 任務基準路徑為進度歸屬識別：未輸入即拒絕，避免寫入無法比對的進度檔 */
	if (!basePath?.trim())
	{
		throw new TypeError(`loadTaskProgress: basePath is required, got ${JSON.stringify(basePath)} (${file})`);
	}

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

	let done = new Map<string, IDoneEntry>();
	let checkpoint: ITaskCheckpoint | undefined;

	if (saved && saved.version === PROGRESS_VERSION && saved.basePath === basePath)
	{
		done = new Map(saved.done.map(entry => [entry.path, entry] as [string, IDoneEntry]));
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
			done: [...done.values()].sort((a, b) => a.path.localeCompare(b.path)),
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

		done: path => done.get(path),

		checkpoint: path => (checkpoint && checkpoint.path === path ? checkpoint : undefined),

		saveCheckpoint: async (state: ITaskCheckpoint) =>
		{
			checkpoint = state;
			await write();

			_logPhase(
				EnumPostPhase.AutoPost,
				options,
				`progress checkpoint: batch ${state.batchNo}, ${state.remaining.length} left (${state.path})`,
				'success',
			);
		},

		mark: async (path: string, boundary: IDoneBoundary) =>
		{
			done.set(path, { path, ...boundary });

			/** 標記完成即清除同單位檢查點：該單位已無待執行佇列 */
			if (checkpoint?.path === path)
			{
				checkpoint = undefined;
			}

			await write();
			_logPhase(EnumPostPhase.AutoPost, options, `progress saved: ${done.size} done tasks (${path})`, 'info');
		},

		seed: async (entries: readonly IDoneEntry[]) =>
		{
			let added = 0;

			/** 僅補進度缺少的路徑：既有進度（較新）優先，不被外部紀錄覆寫 */
			for (const entry of entries)
			{
				if (done.has(entry.path)) continue;

				done.set(entry.path, entry);
				added++;
			}

			if (!added)
			{
				_logPhase(EnumPostPhase.AutoPost, options, `progress seed: nothing restored (${entries.length} given)`);
				return;
			}

			await write();
			_logPhase(
				EnumPostPhase.AutoPost,
				options,
				`progress seeded: ${added} boundaries restored (${done.size} done tasks)`,
				'info',
			);
		},
	};
}
