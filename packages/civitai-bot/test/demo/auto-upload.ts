/// <reference types="node" />

import { join } from 'node:path';
import { console } from 'debug-color2';
// @ts-ignore
import { EnumAutomationEngine } from 'lazy-playwright-impl/lib/engine';
// @ts-ignore
import { createBrowserAutomation } from 'lazy-playwright-impl/lib/index';
// @ts-ignore
import { __TEST_TEMP, __TEST_TEMP_STORAGE } from 'lazy-playwright-impl/test/__root';
// @ts-ignore
import { createPostPage } from '#/lib/page';
// @ts-ignore
import { EnumLogLabel, consoleLogger } from '#/lib/logger';
// @ts-ignore
import { autoPost, collectFolders } from '#/lib/auto-post';
// @ts-ignore
import { loadTaskProgress } from '#/lib/progress';
// @ts-ignore
import { createCompletionRecord, findStartAfterLastPublish } from '#/lib/record';
// @ts-ignore
import { prependFolder } from '#/lib/source';
// @ts-ignore
import type { IFolderInput, IMessageOptions, IRunSwitches, ITaskRangeOptions } from '#/lib/types';
import { globStream, async as globAsync } from 'fast-glob';

/**
 * CLI 參數（`process.argv`）：
 *
 * - `--task-base <path>`：任務基準路徑（預設為單日目錄常數；見 {@link TASK_BASE}）
 * - `--max-tasks <n>`：最大任務數（覆寫 {@link TASK_RANGE}.maxTasks）
 * - `--from-last-publish`：無可接續紀錄時，以最後一次發布成功紀錄找尋新任務起始點
 *   （覆寫 startDay / startTask）
 * - `--publish`：解除發布停用（預設停用；絕不按 save 的安全規則不變）
 * - `--no-dry-run`：解除 dry run（預設第 2 批起僅報告）
 * - `--close`：執行結束後關閉瀏覽器（`automation.close()`）
 * - `--create-url <url>`：變更上傳（建立貼文）頁面網址（預設 `CREATE_URL`）
 */
const ARGV = process.argv.slice(2);

/** CLI 參數集合：布林旗標判定用 */
const CLI_ARGS = new Set(ARGV);

/**
 * 取得 CLI 字串參數值：支援 `--name value` 與 `--name=value`
 *
 * 未指定、缺少值、或下一個 token 為旗標（以 `--` 開頭）時回傳 `undefined`
 */
function _argValue(name: string): string | undefined
{
	const prefix = `${name}=`;
	const inline = ARGV.find(arg => arg.startsWith(prefix));

	if (inline !== undefined)
	{
		return inline.slice(prefix.length) || undefined;
	}

	const index = ARGV.indexOf(name);
	const value = index >= 0 ? ARGV[index + 1] : undefined;

	return value !== undefined && !value.startsWith('--') ? value : undefined;
}

/**
 * 取得 CLI 整數參數值：非正整數或未指定時回傳 `undefined`
 */
function _argInt(name: string): number | undefined
{
	const value = _argValue(name);
	const parsed = value === undefined ? Number.NaN : Number(value);

	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** 是否於執行結束後關閉瀏覽器 */
const CLOSE_AFTER = CLI_ARGS.has('--close');

/** 是否以最後一次發布成功紀錄找尋新任務起始點（僅無可接續紀錄時生效） */
const FROM_LAST_PUBLISH = CLI_ARGS.has('--from-last-publish');

/** 執行設定：僅在明確指定時覆寫預設值 */
const SWITCHES: IRunSwitches = {};

if (CLI_ARGS.has('--publish'))
{
	SWITCHES.enablePublish = true;
}

if (CLI_ARGS.has('--no-dry-run'))
{
	SWITCHES.disableDryRun = true;
}

/** 建立貼文頁（上傳頁面）網址：CLI `--create-url <url>` 指定；未指定時沿用 `CREATE_URL` 預設 */
SWITCHES.createUrl = _argValue('--create-url');

/** 登入狀態的儲存 id：先以 storage/save 寫入 civitai.red 的登入狀態 */
const STORAGE_ID = 'default';

/** 儲存目錄（Cookie / Session） */
const STORAGE_BASE_DIR = __TEST_TEMP_STORAGE;

/**
 * 任務基準路徑：
 *
 * - 單日目錄（`...\\agent-scheduler\\2026-09-13`）：起始天即該日，可選 {@link TASK_RANGE}.endDay 續掃後續天
 * - 根目錄（`...\\agent-scheduler\\`）：需以 {@link TASK_RANGE}.startDay 指定起始天
 *
 * CLI `--task-base <path>` 可覆寫。
 */
const TASK_BASE = _argValue('--task-base') ?? 'D:\\sd-forge\\output\\agent-scheduler\\2026-09-13';

/** CLI `--max-tasks <n>`：最大任務數；未指定或非正整數時不覆寫 */
const MAX_TASKS = _argInt('--max-tasks');

/** 任務範圍：起始天 / 結束天 / 起始任務 / 最大任務數 / 最大任務天數（皆可選）；`--max-tasks <n>` 於此合併 */
const TASK_RANGE: ITaskRangeOptions = {
	// startDay: '2026-09-13',
	// endDay: '2026-09-20',
	// startTask: '14-41-51_task(7gysqd604e7jv3m)',
	// maxTasks: 5,
	// maxDays: 3,
	...(MAX_TASKS !== undefined && { maxTasks: MAX_TASKS }),
};

/** 任務進度檔：記錄已完成任務；中斷後由該檔接續，需完全重跑時刪除該檔 */
const PROGRESS_FILE = join(__TEST_TEMP, 'civitai-bot', 'auto-post.progress.json');

/** 完成紀錄目錄：完成任務依發布日期分檔保存（`YYYY-MM-DD.json`，含發布網址） */
const RECORD_DIR = join(__TEST_TEMP, 'civitai-bot', 'completion');

consoleLogger.log(
	EnumLogLabel.Temp,
	`[auto-post] cli: publish=${SWITCHES.enablePublish === true}`
	+ `, dryRun=${SWITCHES.disableDryRun === true ? 'off' : 'on'}`
	+ `, close=${CLOSE_AFTER}`
	+ `, createUrl=${SWITCHES.createUrl ?? 'default'}`,
);

consoleLogger.log(
	EnumLogLabel.Temp,
	`[auto-post] cli scan: taskBase=${TASK_BASE}`
	+ `, maxTasks=${TASK_RANGE.maxTasks ?? 'none'}`
	+ `, fromLastPublish=${FROM_LAST_PUBLISH}`,
);

/**
 * 示範：自動上傳圖片到 civitai.red 建立貼文頁並分批發文
 *
 * 流程：載入任務進度（{@link loadTaskProgress}） → 無可接續紀錄且指定 `--from-last-publish` 時，
 * 以完成紀錄找尋新任務起始點（{@link findStartAfterLastPublish}） →
 * 串接來源串流（{@link collectFolders}，以 `next()` 探測首項判定空否） →
 * 還原登入狀態、建立完成紀錄（{@link createCompletionRecord}） → 開啟建立貼文頁（{@link createPostPage}） →
 * 完整階段（{@link autoPost}：確認上傳區、逐任務逐批上傳、發布完成後重開頁面執行下一批次、發布開關檢查）。
 *
 * 第 2 批起為 dry run；不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 * CLI 參數（{@link CLI_ARGS}）可覆寫任務基準路徑、最大任務數與上傳頁面網址，
 * 解除發布停用與 dry run，自最後一次發布成功紀錄找尋起始點，並於結束後關閉瀏覽器。
 *
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param range 任務範圍（獨立物件；僅於未指定 `source` 的掃描模式生效）
 * @param source 來源輸入模式：globStream / globAsync / Iterable / Generator / 構建函式（獨立物件）；
 *   指定時取代 `TASK_BASE` + `range` 掃描
 */
export async function autoUploadDemo(
	options?: IMessageOptions,
	range: ITaskRangeOptions = TASK_RANGE,
	source?: IFolderInput,
)
{
	/** 任務進度：載入完成任務與中斷檢查點，供中斷後接續 */
	const progress = await loadTaskProgress(PROGRESS_FILE, TASK_BASE, options);

	/** 掃描起始點：預設沿用 `range`；無可接續紀錄時改以最後一次發布成功紀錄推導 */
	let scanRange = range;

	/** 無可接續紀錄（無完成任務、無中斷檢查點）時，以最後一次發布成功紀錄找尋新任務的起始點 */
	if (FROM_LAST_PUBLISH && progress.size === 0 && !progress.hasCheckpoint)
	{
		const start = await findStartAfterLastPublish(RECORD_DIR, options);

		if (start)
		{
			scanRange = { ...range, ...start };
		}
	}

	/** 來源串流 (Folder Stream)：生成器逐項產出，大量目錄時不建立中間陣列 */
	const folders = collectFolders(TASK_BASE, scanRange, options, source);

	/** 探測首項：空清單即提前中止（不啟動瀏覽器），首項稍後接回串流 */
	const head = await folders.next();

	if (head.done)
	{
		consoleLogger.log(EnumLogLabel.Temp, '[auto-post] no folders to run');
		return;
	}

	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: STORAGE_BASE_DIR },
		},
	});

	try
	{
		const context = await automation.newContext();

		/** 還原登入狀態；尚未儲存過時僅記錄，後續頁面會以未登入狀態開啟 */
		const applied = await automation.storage.cookies.apply(STORAGE_ID, context);
		const restored = await automation.storage.sessions.restore(STORAGE_ID, context);

		consoleLogger.log(EnumLogLabel.Temp, `[auto-post] cookies applied: ${applied}`);
		consoleLogger.log(EnumLogLabel.Temp, `[auto-post] session restored: ${restored}`);

		/** 完成紀錄：完成任務依發布日期分檔保存 */
		const record = createCompletionRecord(RECORD_DIR, options);

		const page = await createPostPage(context, SWITCHES.createUrl);

		await autoPost(page, prependFolder(head.value, folders), options, progress, SWITCHES, record);
	}
	finally
	{
		if (CLOSE_AFTER)
		{
			await automation.close();
		}
	}
}

autoUploadDemo().catch(console.error);
