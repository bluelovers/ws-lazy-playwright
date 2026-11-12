/// <reference types="node" />

import { join } from 'upath2';
import { console } from 'debug-color2';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { createBrowserAutomation } from 'lazy-playwright-impl/lib/index';
import { __TEST_TEMP, __TEST_TEMP_STORAGE } from 'lazy-playwright-impl/test/__root';
import { createPostPage } from '#/lib/civitai/page';
import { consoleLoggerTimeAndLabel } from '@lazy-playwright/logger';
import { EnumLogLabel, _logPhase } from '#/lib/logger';
import { autoPost, collectFolders, startFolderStream } from '#/lib/auto-post';
import { loadTaskProgress } from '#/lib/progress';
import { createCompletionRecord, resumeFromCompletion } from '#/lib/record';
import { IAutoPostCli, parseAutoPostCli } from '#/lib/cli';
import { EnumPostPhase, type IFolderInput, type IMessageOptions, type IRunContext, type ITaskRangeOptions } from '#/lib/types/types';
import { globStream, async as globAsync } from 'fast-glob';
import { hideBin } from 'yargs/helpers';
import type { ITSValueOrArrayMaybeReadonly } from 'ts-type';
import { LimitReachedError } from '#/lib/civitai/notifications';

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
 * - 資料夾（`EnumFolderKind.Folder`，如 `...\\txt2img-images`）：未指定起始天時以該資料夾本身為上傳單位
 *   （只取直接位於其內的圖檔，不含日期子目錄）
 *
 * CLI `--task-base <path>` 可覆寫。
 */
let DEFAULT_TASK_BASE: ITSValueOrArrayMaybeReadonly<string> = [
	'D:\\sd-forge\\output\\agent-scheduler\\2026-11-09',
	'D:\\sd-forge\\output\\txt2img-images\\2026-11-09',
	'D:\\sd-forge\\output\\txt2img-images',
];

let DEFAULT_CREATE_URL: string;
// DEFAULT_CREATE_URL = 'https://civitai.red/posts/create?modelId=3007290&modelVersionId=3449278&returnUrl=%2Fmodels%2F3007290%2Fllm-text-encoder-ollama-image-to-prompts-workflow%3FmodelVersionId%3D3449278';

/** CLI 參數（yargs 解析，旗標語意見 {@link parseAutoPostCli}） */
const CLI = parseAutoPostCli(hideBin(process.argv), {
	range: TASK_RANGE,
	switches: {
		createUrl: DEFAULT_CREATE_URL,
	},
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
 * {@link autoUploadDemo} 的注入參數：函式執行所需值皆由簽名取得，
 * 欄位省略時才回落模組層預設（CLI 解析結果 / 儲存與進度、紀錄路徑）
 */
export interface IAutoUploadDemoParams
{
	/** 任務基準路徑（單一路徑或多路徑；多路徑共用同一瀏覽器實例逐一執行）；預設 {@link taskBaseInput} */
	taskBase?: ITSValueOrArrayMaybeReadonly<string>;
	/** 登入狀態的儲存 id；預設 {@link STORAGE_ID} */
	storageId?: string;
	/** 儲存目錄（Cookie / Session）；預設 {@link STORAGE_BASE_DIR} */
	storageBaseDir?: string;
	/** 任務進度檔；預設 {@link PROGRESS_FILE} */
	progressFile?: string;
	/** 完成紀錄目錄；預設 {@link RECORD_DIR} */
	recordDir?: string;
}

/**
 * 執行期 context：{@link autoUploadDemo} 建立，由上而下傳遞本次執行的所有相關參數
 *
 * 底層欄位繼承自 {@link IRunContext}（CLI、訊息控制、任務範圍、來源、目前任務基準路徑、
 * 任務進度與完成紀錄）——掃描、完整階段與批次報告一律自 context 取用；
 * CLI 已定義的參數（執行設定 `switches`、`fromLastPublish` 等）取自 `cli`，不在此重複定義。
 * 其餘為本示範入口的執行期參數（多路徑清單、儲存與進度／紀錄路徑）。
 *
 * 逐路徑迴圈以展開運算逐路徑併入 `taskBase`、掃描範圍、`progress` 與共用 `record`。
 */
export interface IAutoUploadRunContext extends IRunContext
{
	/** 任務基準路徑（正規化為陣列）：多路徑逐一執行並共用同一瀏覽器實例 */
	taskBases: readonly string[];
	/** 登入狀態的儲存 id */
	storageId: string;
	/** 儲存目錄（Cookie / Session） */
	storageBaseDir: string;
	/** 任務進度檔 */
	progressFile: string;
	/** 完成紀錄目錄 */
	recordDir: string;
}

/**
 * 示範：自動上傳圖片到 civitai.red 建立貼文頁並分批發文
 *
 * 多路徑（`taskBaseInput`）時全程共用同一個 automation / context 實例，逐路徑載進度、掃描、開頁發文；
 * 任一路徑達上限即停止後續路徑。
 *
 * 僅負責組裝 lib 流程：
 *
 * 1. 逐路徑載入任務進度（{@link loadTaskProgress}）
 * 2. 指定 `--from-last-publish` 時以完成紀錄重建續跑狀態——完成邊界補齊進度、
 *    無可接續紀錄時覆寫掃描起始點（{@link resumeFromCompletion}）
 * 3. 逐路徑串接來源串流並探測首項（{@link collectFolders} + {@link startFolderStream}，
 *    空清單跳過該路徑、不中斷後續路徑）
 * 4. 建立 context（`storage.restore` 內建還原登入狀態，不需自行組裝）、建立完成紀錄
 *    （{@link createCompletionRecord}）、逐路徑開啟建立貼文頁（{@link createPostPage}）
 * 5. 完整階段（{@link autoPost}：確認上傳區、逐任務逐批上傳、發布完成後重開頁面執行下一批次）
 *
 * 執行期參數由 {@link IAutoUploadRunContext} 彙整，逐路徑併入任務基準路徑、掃描範圍、
 * 進度與完成紀錄後，由上而下傳遞至掃描、完整階段與批次報告（底層一律自 context 取用參數）。
 *
 * 系統提示顯示已達上限（{@link LimitReachedError}）時停止任務。
 *
 * 第 2 批起為 dry run；不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 * CLI 參數（{@link parseAutoPostCli}）可覆寫任務基準路徑、最大任務數與上傳頁面網址，
 * 解除發布停用與 dry run，以完成紀錄重建續跑狀態，並於結束後關閉瀏覽器。
 *
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param range 任務範圍（獨立物件；預設取 `cli.range`；僅於未指定 `source` 的掃描模式生效）
 * @param source 來源輸入模式：globStream / globAsync / Iterable / Generator / 構建函式（獨立物件）；
 *   指定時取代 `taskBase` + `range` 掃描
 * @param params 注入參數（{@link IAutoUploadDemoParams}：任務基準路徑、儲存與進度／紀錄路徑）；
 *   省略的欄位取模組層預設
 */
export async function autoUploadDemo(
	cli: IAutoPostCli,
	options?: IMessageOptions,
	range?: ITaskRangeOptions,
	source?: IFolderInput,
	params: IAutoUploadDemoParams = {},
)
{
	/** 任務基準路徑：正規化為陣列，多路徑逐一執行並共用同一瀏覽器實例 */
	const taskBaseList = cli.taskBase ?? params.taskBase ?? DEFAULT_TASK_BASE;
	const taskBases: readonly string[] = typeof taskBaseList === 'string' ? [taskBaseList] : taskBaseList;

	/** 逐路徑驗證基準路徑：任一路徑未輸入即拒絕（提前失敗，不啟動瀏覽器） */
	for (const taskBase of taskBases)
	{
		if (!taskBase?.trim())
		{
			throw new TypeError(`autoUploadDemo: taskBase is required, got ${JSON.stringify(taskBase)}`);
		}
	}

	/** 注入參數與模組層預設合併：僅未指定的欄位回落預設 */
	const storageId = params.storageId ?? STORAGE_ID;
	const storageBaseDir = params.storageBaseDir ?? STORAGE_BASE_DIR;
	const progressFile = params.progressFile ?? PROGRESS_FILE;
	const recordDir = params.recordDir ?? RECORD_DIR;

	/** 多路徑共用：整個執行只建立一次瀏覽器實例 */
	const automation = await createBrowserAutomation({
		// engine: EnumAutomationEngine.Playwright,
		storage: {
			file: { baseDir: storageBaseDir },
			/** 建立 context 時自動還原登入狀態（Cookie / Session），不需自行組裝還原流程 */
			restore: { id: storageId },
		},
	});

	/**
	 * 執行期 context：彙整本次執行的所有相關參數（CLI、範圍、來源、儲存與進度／紀錄路徑、瀏覽器實例），
	 * 由上而下傳遞至掃描、完整階段與批次報告；
	 * 逐路徑迴圈再以展開運算併入目前任務基準路徑、掃描範圍、進度與完成紀錄
	 */
	const ctx: IAutoUploadRunContext = {
		cli,
		options,
		/** 任務範圍：未指定時取 CLI 解析結果 `range` */
		range: range ?? cli.range,
		source,
		automation,
		taskBases,
		storageId,
		storageBaseDir,
		progressFile,
		recordDir,
	};

	let currentPage = automation.page;

	try
	{
		/** 鎖定 automation 主 context（`storage.restore` 內建還原登入狀態）：後續新分頁皆於其中開頁發文 */
		await automation.newContext();

		/** 完成紀錄：完成任務依發布日期分檔保存（多路徑共用同一實例） */
		const record = createCompletionRecord(ctx.recordDir, ctx.options);

		/** 逐路徑載進度、掃描並探測首項，於共用 context 開頁發文 */
		for (const taskBase of ctx.taskBases)
		{
			/** 多路徑執行時回報目前進行到哪一條路徑 */
			_logPhase(EnumPostPhase.AutoPost, ctx.options, `current task base: ${taskBase}`, ['yellow', 'bgGreenBright', 'info']);

			/** 該路徑的任務進度：載入完成任務與中斷檢查點，供中斷後接續 */
			const progress = await loadTaskProgress(ctx.progressFile, taskBase, ctx.options);

			/** 掃描範圍：指定 `--from-last-publish` 時以完成紀錄重建續跑狀態，否則沿用任務範圍 */
			const scanRange = ctx.cli.fromLastPublish
				? await resumeFromCompletion(progress, ctx.range, ctx.recordDir, ctx.options)
				: ctx.range;

			/**
			 * 逐路徑執行期 context：併入目前任務基準路徑、掃描範圍、進度與共用完成紀錄，
			 * 由上而下傳遞給掃描（{@link collectFolders}）、完整階段（{@link autoPost}）與批次報告
			 */
			const runCtx: IAutoUploadRunContext & { taskBase: string } = { ...ctx, taskBase, range: scanRange, progress, record };

			/** 來源串流：探測首項 */
			const stream = await startFolderStream(collectFolders(runCtx), runCtx);

			/** 空清單：回報該路徑後跳過，不中斷後續路徑 */
			if (!stream)
			{
				_logPhase(EnumPostPhase.AutoPost, runCtx.options, `skip task base (no folders): ${taskBase}`);
				continue;
			}

			currentPage = await createPostPage(runCtx.automation, runCtx.cli.switches.createUrl, currentPage);

			await autoPost(currentPage, stream, runCtx);
		}
	}
	catch (error)
	{
		/** 系統提示判定已達上限：停止任務（進度已於批次完成時落盤，下次可續跑） */
		if (!(error instanceof LimitReachedError)) throw error;

		consoleLoggerTimeAndLabel.error(
			EnumLogLabel.CivitaiBot,
			`[auto-post] limit reached, task stopped: ${error.message}`,
		);
	}
	finally
	{
		if (cli.closeAfter)
		{
			await automation.close();
		}
	}
}

autoUploadDemo(CLI).catch(console.error);
