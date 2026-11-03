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
import { CREATE_URL } from '#/lib/const';
// @ts-ignore
import { EnumLogLabel, consoleLogger } from '#/lib/logger';
// @ts-ignore
import { autoPost, collectFolders } from '#/lib/auto-post';
// @ts-ignore
import { prependFolder } from '#/lib/source';
// @ts-ignore
import type { IFolderInput, IMessageOptions, ITaskRangeOptions } from '#/lib/types';
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

/**
 * 示範：自動上傳圖片到 civitai.red 建立貼文頁並分批發文
 *
 * 流程：串接來源串流（{@link collectFolders}，以 `next()` 探測首項判定空否） → 還原登入狀態 → 開啟建立貼文頁 →
 * 完整階段（{@link autoPost}：確認上傳區、逐任務逐批上傳、發布開關檢查）。
 *
 * 第 2 批起為 dry run；不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
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

		const page = await context.newPage();
		await page.goto(CREATE_URL);

		await autoPost(page, prependFolder(head.value, folders), options);
	}
	finally
	{
		// await automation.close();
	}
}

autoUploadDemo().catch(console.error);
