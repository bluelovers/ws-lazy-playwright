/// <reference types="node" />

import { join } from 'node:path';
import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from 'lazy-playwright-impl/lib/index';
import { __TEST_TEMP, __TEST_TEMP_STORAGE } from 'lazy-playwright-impl/test/__root';
import { createPostPage, LimitReachedError } from '#/lib/page';
import { EnumLogLabel, consoleLogger } from '#/lib/logger';
import { autoPost, collectFolders, startFolderStream } from '#/lib/auto-post';
import { loadTaskProgress } from '#/lib/progress';
import { createCompletionRecord, resumeFromCompletion } from '#/lib/record';
import { parseAutoPostCli } from '#/lib/cli';
import type { IFolderInput, IMessageOptions, ITaskRangeOptions } from '#/lib/types';
import { globStream, async as globAsync } from 'fast-glob';

/** 任務範圍預設值：可在此指定起始天 / 結束天 / 起始任務 / 最大任務天數；`--max-tasks <n>` 由 CLI 合併 */
const TASK_RANGE: ITaskRangeOptions = {
	// startDay: '2026-09-13',
	// endDay: '2026-09-20',
	// startTask: '14-41-51_task(7gysqd604e7jv3m)',
	// maxTasks: 5,
	// maxDays: 3,
};

/**
 * 任務基準路徑預設值：
 *
 * - 單日目錄（`...\\2026-11-05`）：起始天即該日，可選 `range.endDay` 續掃後續天
 * - 根目錄（`...\\`）：需以 `range.startDay` 指定起始天
 *
 * CLI `--task-base <path>` 可覆寫。
 */
const DEFAULT_TASK_BASE = 'D:\\sd-forge\\output\\txt2img-images\\2026-11-05';

/** CLI 參數（旗標語意見 {@link parseAutoPostCli}） */
const CLI = parseAutoPostCli(process.argv.slice(2), {
	taskBase: DEFAULT_TASK_BASE,
	range: TASK_RANGE,
});

/** 登入狀態的儲存 id：先以 storage/save 寫入 civitai.red 的登入狀態 */
const STORAGE_ID = 'default';

/** 儲存目錄（Cookie / Session） */
const STORAGE_BASE_DIR = __TEST_TEMP_STORAGE;

/** 任務進度檔：記錄已完成任務；中斷後由該檔接續，需完全重跑時刪除該檔 */
const PROGRESS_FILE = join(__TEST_TEMP, 'civitai-bot', 'auto-post.progress.json');

/** 完成紀錄目錄：完成任務依發布日期分檔保存（`YYYY-MM-DD.json`，含發布網址） */
const RECORD_DIR = join(__TEST_TEMP, 'civitai-bot', 'completion');

/**
 * 示範：自動上傳圖片到 civitai.red 建立貼文頁並分批發文
 *
 * 僅負責組裝 lib 流程：
 *
 * 1. 載入任務進度（{@link loadTaskProgress}）
 * 2. 指定 `--from-last-publish` 時以完成紀錄重建續跑狀態——完成邊界補齊進度、
 *    無可接續紀錄時覆寫掃描起始點（{@link resumeFromCompletion}）
 * 3. 串接來源串流並探測首項（{@link collectFolders} + {@link startFolderStream}，
 *    空清單提前中止、不啟動瀏覽器）
 * 4. 還原登入狀態、建立完成紀錄（{@link createCompletionRecord}）、開啟建立貼文頁（{@link createPostPage}）
 * 5. 完整階段（{@link autoPost}：確認上傳區、逐任務逐批上傳、發布完成後重開頁面執行下一批次）
 *
 * 系統提示顯示已達上限（{@link LimitReachedError}）時停止任務。
 *
 * 第 2 批起為 dry run；不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 * CLI 參數（{@link parseAutoPostCli}）可覆寫任務基準路徑、最大任務數與上傳頁面網址，
 * 解除發布停用與 dry run，以完成紀錄重建續跑狀態，並於結束後關閉瀏覽器。
 *
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param range 任務範圍（獨立物件；預設取 CLI 解析結果 `range`；僅於未指定 `source` 的掃描模式生效）
 * @param source 來源輸入模式：globStream / globAsync / Iterable / Generator / 構建函式（獨立物件）；
 *   指定時取代 `taskBase` + `range` 掃描
 */
export async function autoUploadDemo(
	options?: IMessageOptions,
	range: ITaskRangeOptions = CLI.range,
	source?: IFolderInput,
)
{
	/** 任務進度：載入完成任務與中斷檢查點，供中斷後接續 */
	const progress = await loadTaskProgress(PROGRESS_FILE, CLI.taskBase, options);

	/** 掃描範圍：指定 `--from-last-publish` 時以完成紀錄重建續跑狀態，否則沿用 `range` */
	const scanRange = CLI.fromLastPublish
		? await resumeFromCompletion(progress, range, RECORD_DIR, options)
		: range;

	/** 來源串流：探測首項，空清單即提前中止（不啟動瀏覽器） */
	const stream = await startFolderStream(collectFolders(CLI.taskBase, scanRange, options, source), options);

	if (!stream)
	{
		return;
	}

	const automation = await createBrowserAutomation({
		// engine: EnumAutomationEngine.Playwright,
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

		consoleLogger.log(EnumLogLabel.CivitaiBot, `[auto-post] cookies applied: ${applied}`);
		consoleLogger.log(EnumLogLabel.CivitaiBot, `[auto-post] session restored: ${restored}`);

		/** 完成紀錄：完成任務依發布日期分檔保存 */
		const record = createCompletionRecord(RECORD_DIR, options);

		const page = await createPostPage(context, CLI.switches.createUrl);

		await autoPost(page, stream, options, progress, CLI.switches, record);
	}
	catch (error)
	{
		/** 系統提示判定已達上限：停止任務（進度已於批次完成時落盤，下次可續跑） */
		if (!(error instanceof LimitReachedError)) throw error;

		consoleLogger.error(
			EnumLogLabel.CivitaiBot,
			`[auto-post] limit reached, task stopped: ${error.message}`,
		);
	}
	finally
	{
		if (CLI.closeAfter)
		{
			await automation.close();
		}
	}
}

autoUploadDemo().catch(console.error);
