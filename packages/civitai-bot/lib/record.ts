import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'upath2';
import { _folderKindIsDayLike, expandFolder, toTaskFolder } from './path-kind/folder';
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
	/**
	 * 跨日繼承的發布網址：寫入該路徑「當日首個條目」（{@link ICompletionRecord.append} / {@link ICompletionRecord.updateOrAppend}）時，
	 * 由最新一筆舊紀錄（其自身 + 其 `history*` 欄位）合併帶入，不含當日
	 */
	historyPublishedUrls?: string[];
	/**
	 * 跨日繼承的發布次數：與 {@link ICompletionEntry.historyPublishedUrls} 同批帶入
	 *
	 * 不計入 {@link ICompletionRecord.publishedCount}——各日仍以檔案內自身次數合計，
	 * 繼承欄位僅為跨日傳承，計入即重複計算
	 */
	historyPublishCount?: number;
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
	/**
	 * 將完成任務寫入發布日期對應的紀錄檔（`YYYY-MM-DD.json`）：一律新增一筆
	 *
	 * 當日尚無該路徑條目、而之前日期已有紀錄時，以 `history*` 欄位鏈式承接最新一筆舊紀錄（自身 + 其 history，跨日）
	 */
	append(input: ICompletionInput): Promise<void>;
	/**
	 * 寫入發布事件：同日檔案內已有同路徑條目時就地更新（發布次數與網址累加、完成邊界取本次），
	 * 否則新增一筆——同一路徑不因逐批發布而分裂為多筆紀錄
	 *
	 * 當日尚無該路徑條目、而之前日期已有紀錄時，以 `history*` 欄位鏈式承接最新一筆舊紀錄（自身 + 其 history，跨日）；
	 * 同日續寫時既有繼承欄位維持不變
	 *
	 * 同日檔案內容以記憶體快取，重複寫入不重新讀取檔案
	 */
	updateOrAppend(input: ICompletionInput): Promise<void>;
	/** 查詢執行單位的累計發布次數（新舊紀錄合計，未記錄過時為 0；路徑以 `normalize` 標準化比對）；`history*` 繼承欄位不計入（繼承即重複）；供發布次數上限的累計判定 */
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
 * 同日檔案以「讀取既有內容 → 寫入 → 暫存檔改名」寫入，且內容以記憶體快取：
 * 中途失敗或中斷時，正式檔案仍保留上一次的完整內容，不寫入半份資料；同日重複寫入不重新讀取檔案。
 *
 * 同路徑以 {@link ICompletionRecord.updateOrAppend} 寫入：既有條目就地更新並收斂重複筆，
 * 同一路徑不因逐批發布而分裂為多筆紀錄；{@link ICompletionRecord.append} 則一律新增一筆。
 * 跨日寫入（當日尚無該路徑條目）時，以鏈式承接最新一筆舊紀錄的 `history*` 欄位
 * （其自身 + 其 history，不回頭累加更舊檔案），發布脈絡不因分檔而遺失；
 * 再次跨日時合併結果與前一日相同（自身 + 其 history）。
 *
 * 紀錄檔為歷史資料：不因進度檔的重跑判定而重置，跨執行持續累加。
 *
 * 每筆含該次完成的發布次數（`publishCount`），{@link ICompletionRecord} 據此合計單位的
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

	/** 各路徑於「寫入日期之前」全部紀錄檔的累計發布（網址聯集、次數合計）：跨日繼承用 */
	let historyByPath: Map<string, { urls: Set<string>; count: number }> | undefined;

	/** {@link historyByPath} 建構時的寫入日期：跨日後重建，以納入前一日於跨日前寫入的條目 */
	let historyDate: string | undefined;

	/** 單筆條目的發布次數：舊紀錄無 `publishCount` 欄位時以 `publishedUrls` 數量計算 */
	const countOf = (entry: ICompletionEntry): number => entry.publishCount ?? entry.publishedUrls?.length ?? 0;

	/**
	 * 載入指定日期的條目清單：優先取記憶體快取（{@link days}），
	 * 未載入才讀取檔案——同日重複寫入（含 {@link ICompletionRecord.updateOrAppend}）不重新 IO 讀取
	 */
	const loadDay = async (date: string): Promise<ICompletionEntry[]> =>
	{
		const cached = days.get(date);

		if (cached) return cached;

		const saved = await readFile(join(dir, `${date}.json`), 'utf8')
			.then(text => JSON.parse(text) as { entries?: ICompletionEntry[] })
			.catch(() => undefined);

		const entries = Array.isArray(saved?.entries) ? saved.entries : [];

		days.set(date, entries);

		return entries;
	};

	/** 條目清單落盤（暫存檔改名）：中途失敗時正式檔案仍保留上一次的完整內容 */
	const flushDay = async (date: string, entries: ICompletionEntry[]): Promise<void> =>
	{
		const file = join(dir, `${date}.json`);

		await mkdir(dir, { recursive: true });
		await writeFile(`${file}.tmp`, JSON.stringify({ date, entries }, undefined, '\t'));
		await rename(`${file}.tmp`, file);
	};

	/** 已建構累計次數時同步累加（尚未建構者由下次查詢掃描檔案取得） */
	const bumpCount = (path: string, delta: number): void =>
	{
		if (counts)
		{
			counts.set(path, (counts.get(path) ?? 0) + delta);
		}
	};

	/** 依寫入輸入建立新條目：路徑標準化、完成時間取寫入當下 */
	const buildEntry = (input: ICompletionInput, now: Date): ICompletionEntry => ({
		path: normalize(input.path),
		day: input.day,
		task: input.task,
		completedAt: now.toISOString(),
		publishedUrls: [...(input.publishedUrls ?? [])],
		publishCount: input.publishCount ?? input.publishedUrls?.length ?? 0,
		lastFile: normalize(input.lastFile),
		lastFileTime: input.lastFileTime,
	});

	/**
	 * 取得各路徑的跨日繼承內容：鏈式承接「最新一筆含該路徑的舊檔」
	 *
	 * 日期檔由新至舊處理：路徑首次出現即由該檔承接——合併該檔內同路徑條目
	 * （自身 `publishCount` / `publishedUrls` + 其 `history*` 欄位），
	 * 更舊檔案對該路徑不再累加，與「前一日自身 + 前一日 history」的合併定義一致。
	 *
	 * 首次呼叫掃描目錄建構記憶體快取（排除當日檔案），同日重複呼叫不重新 IO；
	 * 寫入日期跨越時重建——前一日於跨日前寫入的條目須一併納入。
	 *
	 * @param date 目前寫入日期（其檔案排除於繼承範圍外）
	 */
	const loadHistory = async (date: string): Promise<Map<string, { urls: Set<string>; count: number }>> =>
	{
		if (historyByPath && historyDate === date) return historyByPath;

		const next = new Map<string, { urls: Set<string>; count: number }>();

		/** 檔名即日期（`YYYY-MM-DD.json`）：由新至舊，最新出現該路徑的檔案優先承接 */
		const files = (await readdir(dir, { withFileTypes: true }).catch(() => []))
			.filter(item => item.isFile() && DAY_FILE_RE.test(item.name) && item.name !== `${date}.json`)
			.map(item => item.name)
			.sort((a, b) => b.localeCompare(a));

		for (const file of files)
		{
			/** 該檔內各路徑的合併結果（自身 + history）：僅尚未被較新檔案承接的路徑才採用 */
			const local = new Map<string, { urls: Set<string>; count: number }>();

			for (const entry of await loadDay(file.replace(/\.json$/, '')))
			{
				const path = normalize(entry.path);

				/** 已由較新檔案承接：鏈式只接最新一筆，不回頭累加 */
				if (next.has(path)) continue;

				let hit = local.get(path);

				if (!hit)
				{
					hit = { urls: new Set<string>(), count: 0 };
					local.set(path, hit);
				}

				/** 繼承欄位在前：合併後的網址維持由舊至新 */
				for (const url of entry.historyPublishedUrls ?? []) hit.urls.add(url);
				for (const url of entry.publishedUrls ?? []) hit.urls.add(url);

				hit.count += countOf(entry) + (entry.historyPublishCount ?? 0);
			}

			for (const [path, hit] of local)
			{
				next.set(path, hit);
			}
		}

		historyByPath = next;
		historyDate = date;

		return next;
	};

	/**
	 * 跨日繼承：將該路徑最新一筆舊紀錄的合併結果（自身 + 其 history）以 `history*` 欄位帶入新日期條目
	 *
	 * 無舊紀錄、或舊紀錄從未發布（次數 0 且無網址）時回傳 `undefined`（省略欄位）
	 *
	 * @param date 目前寫入日期
	 * @param path 標準化後的執行單位路徑
	 */
	const buildHistory = async (date: string, path: string): Promise<Pick<ICompletionEntry, 'historyPublishedUrls' | 'historyPublishCount'> | undefined> =>
	{
		const hit = (await loadHistory(date)).get(path);

		if (!hit || (!hit.count && !hit.urls.size)) return undefined;

		_logPhase(
			EnumPostPhase.AutoPost,
			options,
			`completion history inherited: ${path} (+${hit.count} from prior days)`,
			'debug',
		);

		return {
			historyPublishedUrls: [...hit.urls],
			historyPublishCount: hit.count,
		};
	};

	return {
		append: async (input: ICompletionInput) =>
		{
			const now = new Date();
			const date = _dateOf(now);
			const entries = await loadDay(date);
			const entry = buildEntry(input, now);

			/** 跨日寫入：鏈式承接最新一筆舊紀錄的累計發布（同日無可繼承時省略） */
			const history = await buildHistory(date, entry.path);

			entries.push({ ...entry, ...(history ?? {}) });

			await flushDay(date, entries);
			bumpCount(entry.path, countOf(entry));

			_logPhase(EnumPostPhase.AutoPost, options, `completion recorded: ${input.path} -> ${date}.json`, 'info');
		},

		updateOrAppend: async (input: ICompletionInput) =>
		{
			const now = new Date();
			const date = _dateOf(now);
			const entries = await loadDay(date);

			/** 本次發布事件的次數：既有條目累加此值 */
			const delta = input.publishCount ?? input.publishedUrls?.length ?? 0;
			const path = normalize(input.path);

			/** 同路徑的既有條目（含舊版逐批寫入留下的重複筆）：全部收斂為一筆 */
			const matches = entries.filter(item => normalize(item.path) === path);

			if (matches.length)
			{
				const merged = matches[0];

				/** 次數取全部同路徑條目的合計（重複筆收斂不遺失次數）再加本次事件 */
				merged.publishCount = matches.reduce((sum, item) => sum + countOf(item), 0) + delta;

				/** 網址取聯集：既有與本次發布的網址皆保留 */
				const urls = new Set<string>();

				for (const item of matches)
				{
					for (const url of item.publishedUrls ?? []) urls.add(url);
				}
				for (const url of input.publishedUrls ?? []) urls.add(url);

				merged.publishedUrls = [...urls];
				merged.completedAt = now.toISOString();
				merged.day = input.day ?? merged.day;
				merged.task = input.task ?? merged.task;

				/** 完成邊界取本次事件：本次為該路徑最新的發布進度 */
				merged.lastFile = normalize(input.lastFile);
				merged.lastFileTime = input.lastFileTime;

				/** 移除其餘同路徑重複筆，並移至清單末端——條目順序即發布新舊（供起始點取最後發布者） */
				for (let i = entries.length - 1; i >= 0; i--)
				{
					if (entries[i] !== merged && normalize(entries[i].path) === path)
					{
						entries.splice(i, 1);
					}
				}
				entries.splice(entries.indexOf(merged), 1);
				entries.push(merged);
			}
			else
			{
				const entry = buildEntry(input, now);

				/** 跨日寫入：鏈式承接最新一筆舊紀錄的累計發布（同日已有條目時維持原繼承欄位） */
				const history = await buildHistory(date, entry.path);

				entries.push({ ...entry, ...(history ?? {}) });
			}

			await flushDay(date, entries);
			bumpCount(path, delta);

			_logPhase(
				EnumPostPhase.AutoPost,
				options,
				`completion ${matches.length ? 'merged' : 'recorded'}: ${input.path} -> ${date}.json`,
				'info',
			);
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
						/** 紀錄檔內的路徑先標準化，防止分隔符不同而比對失敗 */
						const path = normalize(item.path);

						next.set(path, (next.get(path) ?? 0) + countOf(item));
					}
				}

				counts = next;
			}

			return counts.get(normalize(path)) ?? 0;
		},
	};
}

/**
 * 路徑是否位於基準路徑之下（含本身）
 *
 * 比對前以 `normalize` 統一分隔符，並要求邊界落在分隔符上，
 * 避免 `txt2img-images` 誤判包含 `txt2img-images-backup`
 */
function _isUnder(path: string, base: string): boolean
{
	const target = normalize(path);
	const root = normalize(base);

	return target === root || target.startsWith(root.endsWith('/') ? root : `${root}/`);
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
 * @param scope 起始點範圍：僅由該路徑底下的條目推導（完成邊界仍全量重建，供跨路徑補齊進度）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function findStartAfterLastPublish(
	dir: string,
	scope: string,
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

		/** 起始點只由目前路徑底下的條目推導：其他路徑的發布不得改變本路徑的掃描起點 */
		if (!_isUnder(entry.path, scope)) continue;

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
		_logPhase(EnumPostPhase.AutoPost, options, `no successful publish record under ${scope} (${dir}): start point not applied`, 'warn');
	}

	/** 完成邊界：同一路徑以最新條目為準；舊紀錄無邊界者略過 */
	const doneMap = new Map<string, IDoneEntry>();

	for (const entry of entries)
	{
		if (entry.lastFile === undefined || entry.lastFileTime === undefined) continue;

		/** 紀錄檔內的路徑先標準化：同一路徑取最新條目時不因分隔符而分裂成兩筆 */
		const path = normalize(entry.path);

		doneMap.set(path, { path, lastFile: normalize(entry.lastFile), lastFileTime: entry.lastFileTime });
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
 * @param taskBase 任務基準路徑：起始點僅由其根目錄底下的條目推導
 * @param range 原任務範圍（未覆寫時原樣回傳）
 * @param dir 完成紀錄目錄（{@link createCompletionRecord} 的寫入目錄）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function resumeFromCompletion(
	progress: ITaskProgress,
	taskBase: string,
	range: ITaskRangeOptions,
	dir: string,
	options?: IMessageOptions,
): Promise<ITaskRangeOptions>
{
	/** 是否有可接續紀錄：有即以進度為準，僅補缺漏、不覆寫起始點 */
	const resumable = progress.size > 0 || progress.hasCheckpoint;

	/**
	 * 起始點範圍：取任務基準路徑的根目錄（單日目錄取其上層，其餘取本身）。
	 * 多路徑共用同一份完成紀錄，起始點必須限縮在本路徑底下——
	 * 否則其他路徑（如 agent-scheduler 任務）的發布會推導出 `startDay`，
	 * 使資料夾模式（`EnumFolderKind.Folder`）的基準資料夾被改以天目錄掃描而略過
	 */
	const base = toTaskFolder(taskBase);
	const scope = _folderKindIsDayLike(base) ? dirname(taskBase) : taskBase;

	const resume = await findStartAfterLastPublish(dir, scope, options);

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
