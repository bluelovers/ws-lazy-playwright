import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'upath2';
import { expandFolder, toTaskFolder } from './folder';
import { _logPhase } from './logger';
import type { IDoneBoundary, IDoneEntry, ITaskProgress } from './progress';
import { EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from './types/types';
import { DAY_FILE_RE } from './util/re';

/**
 * 完成任務條目：紀錄檔的單筆內容
 *
 * 完成邊界（{@link IDoneBoundary}）與進度檔同源，供進度遺失時重建續跑狀態；
 * 舊紀錄可省略邊界，此時僅能以路徑推導起始點。
 */
export interface ICompletionEntry extends Partial<IDoneBoundary>
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
	/** 該筆完成對此單位的發布次數（各筆合計即為該目錄發布過的總次數）；舊紀錄省略，計算時以 `publishedUrls` 數量補上 */
	publishCount?: number;
}

/** 寫入輸入：`completedAt` 由寫入當下補上；完成邊界（{@link IDoneBoundary}）必填 */
export interface ICompletionInput extends IDoneBoundary
{
	path: string;
	day?: string;
	task?: string;
	publishedUrls?: readonly string[];
	/** 該筆完成的發布次數；省略時以 `publishedUrls` 數量補上 */
	publishCount?: number;
}

/** 從完成紀錄重建的續跑狀態（{@link findStartAfterLastPublish} 回傳） */
export interface ICompletionResume
{
	/** 掃描起始點（可推導時）：含最後發布任務本身，由完成邊界比對其新增檔案 */
	start?: Pick<ITaskRangeOptions, 'startDay' | 'startTask'>;
	/** 可重建的完成邊界（同一路徑取最新條目）：呼叫端寫入進度後，重跑即比對新增檔案 */
	done: IDoneEntry[];
}

/** 完成紀錄寫入器：完成任務依發布日期分檔保存 */
export interface ICompletionRecord
{
	/** 將完成任務寫入發布日期對應的紀錄檔（`YYYY-MM-DD.json`） */
	append(input: ICompletionInput): Promise<void>;
	/** 查詢執行單位的累計發布次數（新舊紀錄合計，未記錄過時為 0）；供發布次數上限的累計判定 */
	publishedCount(path: string): Promise<number>;
}

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
 * 完成任務依發布日期分檔保存（`<dir>/YYYY-MM-DD.json`，內容含該任務取得的發布網址與完成邊界）。
 * 同日檔案以「讀取既有內容 → 追加 → 暫存檔改名」寫入：
 * 中途失敗或中斷時，正式檔案仍保留上一次的完整內容，不寫入半份資料。
 *
 * 紀錄檔為歷史資料：不因進度檔的重跑判定而重置，跨執行持續累加。
 *
 * 每筆含該次完成的發布次數（`publishCount`），{@link ICompletionRecord.publishedCount} 據此合計單位的
 * 累計發布次數（舊紀錄無此欄位者以 `publishedUrls` 數量計算），供發布次數上限的累計判定。
 *
 * @param dir 紀錄目錄（不存在時建立）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export function createCompletionRecord(dir: string, options?: IMessageOptions): ICompletionRecord
{
	/** 各發布日期已載入的條目：同日重複寫入時不重讀檔案 */
	const days = new Map<string, ICompletionEntry[]>();

	/** 各單位的累計發布次數：首次查詢時掃描目錄內全部紀錄檔建構，其後由寫入同步累加 */
	let counts: Map<string, number> | undefined;

	/** 單筆條目的發布次數：舊紀錄無 `publishCount` 欄位時以 `publishedUrls` 數量計算 */
	const countOf = (entry: ICompletionEntry): number => entry.publishCount ?? entry.publishedUrls?.length ?? 0;

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

			const entry: ICompletionEntry = {
				path: input.path,
				day: input.day,
				task: input.task,
				completedAt: now.toISOString(),
				publishedUrls: [...(input.publishedUrls ?? [])],
				publishCount: input.publishCount ?? input.publishedUrls?.length ?? 0,
				lastFile: input.lastFile,
				lastFileTime: input.lastFileTime,
			};

			entries.push(entry);

			await mkdir(dir, { recursive: true });
			await writeFile(`${file}.tmp`, JSON.stringify({ date, entries }, undefined, '\t'));
			await rename(`${file}.tmp`, file);

			/** 已建構累計次數時同步累加（尚未建構者由下次查詢掃描檔案取得） */
			if (counts)
			{
				counts.set(entry.path, (counts.get(entry.path) ?? 0) + countOf(entry));
			}

			_logPhase(EnumPostPhase.AutoPost, options, `completion recorded: ${input.path} -> ${date}.json`, 'info');
		},

		publishedCount: async (path: string) =>
		{
			if (!counts)
			{
				const next = new Map<string, number>();

				const files = (await readdir(dir, { withFileTypes: true }).catch(() => []))
					.filter(item => item.isFile() && DAY_FILE_RE.test(item.name))
					.map(item => item.name);

				for (const file of files)
				{
					const saved = await readFile(join(dir, file), 'utf8')
						.then(text => JSON.parse(text) as { entries?: ICompletionEntry[] })
						.catch(() => undefined);

					for (const item of saved?.entries ?? [])
					{
						next.set(item.path, (next.get(item.path) ?? 0) + countOf(item));
					}
				}

				counts = next;
			}

			return counts.get(path) ?? 0;
		},
	};
}

/** 依最後發布成功的任務條目，推導掃描起始點（含完成邊界者起始任務為其本身） */
async function _deriveStartAfter(
	entry: ICompletionEntry,
	options?: IMessageOptions,
): Promise<Pick<ITaskRangeOptions, 'startDay' | 'startTask'> | undefined>
{
	const { day, task } = toTaskFolder(entry.path);

	/** 條目須為「天目錄 + 任務」結構才能定位起點 */
	if (!day || !task)
	{
		_logPhase(EnumPostPhase.AutoPost, options, `cannot derive start point (not day/task): ${entry.path}`);
		return undefined;
	}

	/** 新紀錄含完成邊界：起始任務為其本身，由邊界比對新增（截斷任務的未發布餘量續跑） */
	if (entry.lastFile !== undefined && entry.lastFileTime !== undefined)
	{
		return { startDay: day, startTask: task };
	}

	const dayDir = dirname(entry.path);

	/** 同天任務清單：由天目錄標準展開（天目錄展開為自身時無任務名稱，故以任務名稱為準略過） */
	const tasks: string[] = [];

	for await (const unit of expandFolder(toTaskFolder(dayDir), options))
	{
		if (unit.task) tasks.push(unit.task);
	}

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
 * 完整階段：以完成紀錄重建續跑狀態（起始點 + 完成邊界）
 *
 * 自完成紀錄目錄讀取全部日期檔案（由舊至新），重建兩部分：
 *
 * 1. 起始點：取最後一筆 `publishedUrls` 非空的條目（即最後一次發布成功），再依其路徑定位：
 *    - 條目含完成邊界（新紀錄）→ `startTask` 為其本身（含），由完成邊界比對新增檔案，
 *      截斷任務（發布次數上限）的未發布餘量可續跑
 *    - 舊紀錄無完成邊界 → 同天尚有後續任務時 `startTask` 為其下一個；已是該天最後任務則 `startDay` 為隔天
 * 2. 完成邊界：各路徑取最新條目中有邊界者，交由呼叫端寫入進度（{@link ICompletionResume}），
 *    使起始任務比對新增檔案而不重發已完成者
 *
 * 無任何紀錄、或既無可推導起始點也無可重建邊界時回傳 `undefined` 並記錄，
 * 呼叫端維持原範圍。
 *
 * @param dir 完成紀錄目錄（{@link createCompletionRecord} 的寫入目錄）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function findStartAfterLastPublish(
	dir: string,
	options?: IMessageOptions,
): Promise<ICompletionResume | undefined>
{
	const files = (await readdir(dir, { withFileTypes: true }).catch(() => []))
		.filter(item => item.isFile() && DAY_FILE_RE.test(item.name))
		.map(item => item.name)
		.sort((a, b) => b.localeCompare(a));

	/** 由舊至新讀取全部條目：起始點取最後發布者、完成邊界同路徑取最新者 */
	const entries: ICompletionEntry[] = [];

	for (const file of [...files].reverse())
	{
		const saved = await readFile(join(dir, file), 'utf8')
			.then(text => JSON.parse(text) as { entries?: ICompletionEntry[] })
			.catch(() => undefined);

		entries.push(...(saved?.entries ?? []));
	}

	let start: Pick<ITaskRangeOptions, 'startDay' | 'startTask'> | undefined;
	let publishedFound = false;

	/** 由新至舊：最後一筆有發布網址者即最後一次發布成功（僅該筆決定起始點） */
	for (let i = entries.length - 1; i >= 0; i--)
	{
		const entry = entries[i];

		if (!entry.publishedUrls?.length) continue;

		publishedFound = true;
		start = await _deriveStartAfter(entry, options);

		if (start)
		{
			_logPhase(
				EnumPostPhase.AutoPost,
				options,
				`start after last publish (${entry.path}): startDay ${start.startDay}`
				+ `${start.startTask ? `, startTask ${start.startTask}` : ''}`,
			);
		}

		break;
	}

	if (!publishedFound)
	{
		_logPhase(EnumPostPhase.AutoPost, options, `no successful publish record in ${dir}: start point not applied`, 'warn');
	}

	/** 完成邊界：同一路徑以最新條目為準；舊紀錄無邊界者略過 */
	const doneMap = new Map<string, IDoneEntry>();

	for (const entry of entries)
	{
		if (entry.lastFile === undefined || entry.lastFileTime === undefined) continue;

		doneMap.set(entry.path, { path: entry.path, lastFile: entry.lastFile, lastFileTime: entry.lastFileTime });
	}

	const done = [...doneMap.values()];

	if (done.length)
	{
		_logPhase(EnumPostPhase.AutoPost, options, `completion boundaries restored: ${done.length} (${dir})`);
	}

	/** 既無可推導起始點也無可重建邊界：無可套用的續跑狀態 */
	if (!start && !done.length)
	{
		return undefined;
	}

	return { start, done };
}

/**
 * 完整階段：以完成紀錄重建續跑狀態，回傳掃描用任務範圍
 *
 * - 完成邊界寫入進度（{@link ITaskProgress.seed}：僅補缺漏路徑、不覆寫既有）→ 已完成任務不重發
 * - 起始點僅於「無可接續紀錄」（無完成任務、無中斷檢查點）時覆寫範圍；
 *   有可續跑紀錄時以進度為準，維持原範圍並記錄
 * - 無完成紀錄（{@link findStartAfterLastPublish} 回傳 `undefined`）時維持原範圍
 *
 * @param progress 任務進度（可續跑狀態由其判定）
 * @param range 原任務範圍（未覆寫時原樣回傳）
 * @param dir 完成紀錄目錄（{@link createCompletionRecord} 的寫入目錄）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function resumeFromCompletion(
	progress: ITaskProgress,
	range: ITaskRangeOptions,
	dir: string,
	options?: IMessageOptions,
): Promise<ITaskRangeOptions>
{
	/** 是否有可接續紀錄：有即以進度為準，僅補缺漏、不覆寫起始點 */
	const resumable = progress.size > 0 || progress.hasCheckpoint;

	const resume = await findStartAfterLastPublish(dir, options);

	if (!resume)
	{
		return range;
	}

	/** 起始點：僅無可接續紀錄時套用（含最後發布任務本身，由完成邊界比對其新增檔案） */
	const scanRange = resume.start && !resumable
		? { ...range, ...resume.start }
		: range;

	if (resume.start && resumable)
	{
		_logPhase(EnumPostPhase.AutoPost, options, 'start point from completion ignored (progress resumable)', 'debug');
	}

	/** 完成邊界寫入進度（僅補缺漏路徑、不覆寫既有）：已完成任務不重發 */
	await progress.seed(resume.done);

	return scanRange;
}
