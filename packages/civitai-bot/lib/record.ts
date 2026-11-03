import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DAY_DIR_RE, TASK_DIR_RE } from './const';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from './types';

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

/** 日期檔案名特徵（`YYYY-MM-DD.json`） */
const DAY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** 以本地時區取得發布日期（`YYYY-MM-DD`） */
function _dateOf(now: Date): string
{
	const pad = (n: number): string => String(n).padStart(2, '0');

	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 日期加一天（`YYYY-MM-DD`，本地時區、跨月跨年進位） */
function _nextDay(day: string): string
{
	const [year, month, date] = day.split('-').map(Number);

	return _dateOf(new Date(year, month - 1, date + 1));
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

/** 依最後發布成功的任務條目，推導「其之後」的掃描起始點 */
async function _deriveStartAfter(
	entry: ICompletionEntry,
	options?: IMessageOptions,
): Promise<Pick<ITaskRangeOptions, 'startDay' | 'startTask'> | undefined>
{
	const dayDir = dirname(entry.path);
	const day = basename(dayDir);
	const task = basename(entry.path);

	/** 條目須為「天目錄 + 任務」結構才能定位起點 */
	if (!DAY_DIR_RE.test(day) || !TASK_DIR_RE.test(task))
	{
		_logPhase(EnumPostPhase.AutoPost, options, `cannot derive start point (not day/task): ${entry.path}`);
		return undefined;
	}

	const tasks = (await readdir(dayDir, { withFileTypes: true }).catch(() => []))
		.filter(item => item.isDirectory() && TASK_DIR_RE.test(item.name))
		.map(item => item.name)
		.sort((a, b) => a.localeCompare(b));

	const index = tasks.indexOf(task);

	/** 同天尚有後續任務：起始任務為其下一個 */
	if (index >= 0 && index + 1 < tasks.length)
	{
		return { startDay: day, startTask: tasks[index + 1] };
	}

	/** 已是該天最後任務（或任務已不存在）：起始天為隔天 */
	return { startDay: _nextDay(day) };
}

/**
 * 完整階段：以最後一次發布成功紀錄找尋新任務的掃描起始點
 *
 * 自完成紀錄目錄最新的日期檔案往回找，取第一筆 `publishedUrls` 非空的條目
 * （即最後一次發布成功），再依其路徑定位「其之後」的起點：
 *
 * - 同天尚有後續任務 → `startDay` 為該天、`startTask` 為其下一個任務
 * - 已是該天最後任務 → `startDay` 為隔天（不含 `startTask`）
 *
 * 無發布成功紀錄、或該條目非「天目錄 + 任務」結構時回傳 `undefined` 並記錄，
 * 呼叫端維持原範圍。
 *
 * @param dir 完成紀錄目錄（{@link createCompletionRecord} 的寫入目錄）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function findStartAfterLastPublish(
	dir: string,
	options?: IMessageOptions,
): Promise<Pick<ITaskRangeOptions, 'startDay' | 'startTask'> | undefined>
{
	const files = (await readdir(dir, { withFileTypes: true }).catch(() => []))
		.filter(item => item.isFile() && DAY_FILE_RE.test(item.name))
		.map(item => item.name)
		.sort((a, b) => b.localeCompare(a));

	for (const file of files)
	{
		const saved = await readFile(join(dir, file), 'utf8')
			.then(text => JSON.parse(text) as { entries?: ICompletionEntry[] })
			.catch(() => undefined);

		const entries = saved?.entries ?? [];

		/** 由後往前：最後一筆有發布網址者即最後一次發布成功 */
		for (let i = entries.length - 1; i >= 0; i--)
		{
			const entry = entries[i];

			if (!entry.publishedUrls?.length) continue;

			const start = await _deriveStartAfter(entry, options);

			if (start)
			{
				_logPhase(
					EnumPostPhase.AutoPost,
					options,
					`start after last publish (${entry.path}): startDay ${start.startDay}`
					+ `${start.startTask ? `, startTask ${start.startTask}` : ''}`,
				);
			}

			return start;
		}
	}

	_logPhase(EnumPostPhase.AutoPost, options, `no successful publish record in ${dir}: start point not applied`);

	return undefined;
}
