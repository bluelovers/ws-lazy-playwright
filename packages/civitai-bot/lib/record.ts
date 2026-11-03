import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions } from './types';

/** 完成任務條目：紀錄檔的單筆內容 */
export interface ICompletionEntry
{
	/** 執行單位路徑 */
	path: string;
	/** 所屬天目錄（無法判斷時省略） */
	day?: string;
	/** 任務名稱（無法判斷時省略） */
	task?: string;
	/** 完成時間（ISO 8601，寫入當下） */
	completedAt: string;
	/** 各批次發布後取得的網址（未發布時為空陣列） */
	publishedUrls: string[];
}

/** 寫入輸入：`completedAt` 由寫入當下補上 */
export interface ICompletionInput
{
	path: string;
	day?: string;
	task?: string;
	publishedUrls?: readonly string[];
}

/** 完成紀錄寫入器：完成任務依發布日期分檔保存 */
export interface ICompletionRecord
{
	/** 將完成任務寫入發布日期對應的紀錄檔（`YYYY-MM-DD.json`） */
	append(input: ICompletionInput): Promise<void>;
}

/** 以本地時區取得發布日期（`YYYY-MM-DD`） */
function _dateOf(now: Date): string
{
	const pad = (n: number): string => String(n).padStart(2, '0');

	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 完整階段：建立完成紀錄寫入器
 *
 * 完成任務依發布日期分檔保存（`<dir>/YYYY-MM-DD.json`，內容含該任務取得的發布網址）。
 * 同日檔案以「讀取既有內容 → 追加 → 暫存檔改名」寫入：
 * 中途失敗或中斷時，正式檔案仍保留上一次的完整內容，不寫入半份資料。
 *
 * 紀錄檔為歷史資料：不因進度檔的重跑判定而重置，跨執行持續累加。
 *
 * @param dir 紀錄目錄（不存在時建立）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export function createCompletionRecord(dir: string, options?: IMessageOptions): ICompletionRecord
{
	/** 各發布日期已載入的條目：同日重複寫入時不重讀檔案 */
	const days = new Map<string, ICompletionEntry[]>();

	return {
		append: async (input: ICompletionInput) =>
		{
			const now = new Date();
			const date = _dateOf(now);
			const file = join(dir, `${date}.json`);

			let entries = days.get(date);

			if (!entries)
			{
				const saved = await readFile(file, 'utf8')
					.then(text => JSON.parse(text) as { entries?: ICompletionEntry[] })
					.catch(() => undefined);

				entries = Array.isArray(saved?.entries) ? saved.entries : [];
				days.set(date, entries);
			}

			entries.push({
				path: input.path,
				day: input.day,
				task: input.task,
				completedAt: now.toISOString(),
				publishedUrls: [...(input.publishedUrls ?? [])],
			});

			await mkdir(dir, { recursive: true });
			await writeFile(`${file}.tmp`, JSON.stringify({ date, entries }, undefined, '\t'));
			await rename(`${file}.tmp`, file);

			_logPhase(EnumPostPhase.AutoPost, options, `completion recorded: ${input.path} -> ${date}.json`);
		},
	};
}
