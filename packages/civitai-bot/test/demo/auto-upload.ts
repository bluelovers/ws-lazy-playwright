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
import { createCompletionRecord } from '#/lib/record';
// @ts-ignore
import { prependFolder } from '#/lib/source';
// @ts-ignore
import type { IFolderInput, IMessageOptions, IRunSwitches, ITaskRangeOptions } from '#/lib/types';
import { globStream, async as globAsync } from 'fast-glob';

/** 登入狀態的儲存 id：先以 storage/save 寫入 civitai.red 的登入狀態 */
const STORAGE_ID = 'default';

/** 儲存目錄（Cookie / Session） */
const STORAGE_BASE_DIR = __TEST_TEMP_STORAGE;

/**
 * 任務基準路徑：
 *
 * - 單日目錄（`...\\agent-scheduler\\2026-09-13`）：起始天即該日，可選 {@link TASK_RANGE}.endDay 續掃後續天
 * - 根目錄（`...\\agent-scheduler\\`）：需以 {@link TASK_RANGE}.startDay 指定起始天
 */
const TASK_BASE = 'D:\\sd-forge\\output\\agent-scheduler\\2026-09-13';

/** 任務範圍：起始天 / 結束天 / 起始任務 / 最大任務數 / 最大任務天數（皆可選） */
const TASK_RANGE: ITaskRangeOptions = {
	// startDay: '2026-09-13',
	// endDay: '2026-09-20',
	// startTask: '14-41-51_task(7gysqd604e7jv3m)',
	// maxTasks: 5,
	// maxDays: 3,
};

/** 任務進度檔：記錄已完成任務；中斷後由該檔接續，需完全重跑時刪除該檔 */
const PROGRESS_FILE = join(__TEST_TEMP, 'civitai-bot', 'auto-post.progress.json');

/** 完成紀錄目錄：完成任務依發布日期分檔保存（`YYYY-MM-DD.json`，含發布網址） */
const RECORD_DIR = join(__TEST_TEMP, 'civitai-bot', 'completion');

/**
 * CLI 參數（`process.argv`）：
 *
 * - `--publish`：解除發布停用（預設停用；絕不按 save 的安全規則不變）
 * - `--no-dry-run`：解除 dry run（預設第 2 批起僅報告）
 * - `--close`：執行結束後關閉瀏覽器（`automation.close()`）
 */
const CLI_ARGS = new Set(process.argv.slice(2));

/** 是否於執行結束後關閉瀏覽器 */
const CLOSE_AFTER = CLI_ARGS.has('--close');

/** 執行開關：僅在明確指定時覆寫預設停用的開關 */
const SWITCHES: IRunSwitches = {};

if (CLI_ARGS.has('--publish'))
{
	SWITCHES.enablePublish = true;
}

if (CLI_ARGS.has('--no-dry-run'))
{
	SWITCHES.disableDryRun = true;
}

consoleLogger.log(
	EnumLogLabel.Temp,
	`[auto-post] cli: publish=${SWITCHES.enablePublish === true}`
	+ `, dryRun=${SWITCHES.disableDryRun === true ? 'off' : 'on'}`
	+ `, close=${CLOSE_AFTER}`,
);

/**
 * 示範：自動上傳圖片到 civitai.red 建立貼文頁並分批發文
 *
 * 流程：串接來源串流（{@link collectFolders}，以 `next()` 探測首項判定空否） → 還原登入狀態 →
 * 載入任務進度（{@link loadTaskProgress}）、建立完成紀錄（{@link createCompletionRecord}） →
 * 開啟建立貼文頁（{@link createPostPage}） →
 * 完整階段（{@link autoPost}：確認上傳區、逐任務逐批上傳、發布完成後重開頁面執行下一批次、發布開關檢查）。
 *
 * 第 2 批起為 dry run；不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 * CLI 參數（{@link CLI_ARGS}）可解除發布停用與 dry run；`--close` 於結束後關閉瀏覽器。
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
	/** 來源串流 (Folder Stream)：生成器逐項產出，大量目錄時不建立中間陣列 */
	const folders = collectFolders(TASK_BASE, range, options, source);

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

		/** 任務進度：載入已完成任務，供中斷後接續 */
		const progress = await loadTaskProgress(PROGRESS_FILE, TASK_BASE, range, options);

		/** 完成紀錄：完成任務依發布日期分檔保存 */
		const record = createCompletionRecord(RECORD_DIR, options);

		const page = await createPostPage(context);

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
