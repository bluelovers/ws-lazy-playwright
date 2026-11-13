import yargs from 'yargs';

/**
 * CLI 取值結果：yargs 的推導型別將各選項標示為必填，
 * 但未指定的旗標執行時為 `undefined`（`--dry-run` 有 default 除外），故以本型別反映實際取值
 */
export interface IParsedFlags
{
	taskBase?: string;
	maxTasks?: number;
	fromLastPublish?: boolean;
	publish?: boolean;
	/** 由 yargs `default: true` 保證為布林值，`--no-dry-run` 為其否定旗標 */
	dryRun: boolean;
	close?: boolean;
	createUrl?: string;
	agsMaxPublish?: number;
	agsMaxPublishTotal?: boolean;
}

/**
 * 機制層：以 yargs 解析 CLI 旗標並驗證取值（純解析，不含預設值合併與輸出）
 *
 * CLI 參數（`argv`）：
 *
 * 通用：
 *
 * - `--task-base <path>`：任務基準路徑
 * - `--max-tasks <n>`：最大任務數，須為正整數
 * - `--from-last-publish`：以完成紀錄補齊進度缺漏的完成邊界（已完成任務不重發）；
 *   另於無可接續紀錄時找尋新任務起始點（覆寫 startDay / startTask）
 * - `--publish`：解除發布停用（預設停用；絕不按 save 的安全規則不變）
 * - `--no-dry-run`：解除 dry run（預設第 2 批起僅報告；由 yargs 布林選單 `--dry-run` 的否定旗標解析）
 * - `--close`：執行結束後關閉瀏覽器（`automation.close()`）
 * - `--create-url <url>`：變更上傳（建立貼文）頁面網址
 *
 * agent-scheduler 專用（`--ags-` prefix）：
 *
 * - `--ags-max-publish <n>`：任務的發布次數上限，須為正整數，達上限即忽略剩餘圖片（僅任務模式生效，預設不限制）
 * - `--ags-max-publish-total`：上限改以完成紀錄的累計發布次數判定（含該任務已發布過的次數，
 *   已達上限的任務不再發布；須與 `--ags-max-publish` 併用，否則不生效）
 *
 * 無效參數（缺少值、非正整數）由 yargs 判定為錯誤並拋出，而非靜默忽略；`--help` 輸出旗標說明。
 *
 * @param argv CLI 參數（不含執行檔與腳本路徑，通常為 `hideBin(process.argv)`）
 */
export function parseCliFlags(argv: readonly string[]): IParsedFlags
{
	/**
	 * 內嵌式解析：失敗時以例外抛出交由呼叫端處理，不自行結束行程（`exitProcess(false)` + `fail` 抛錯）
	 */
	return yargs(argv)
		.exitProcess(false)
		.fail((message, error) =>
		{
			throw error ?? new Error(message);
		})
		.option('task-base', {
			type: 'string',
			describe: '任務基準路徑',
		})
		.option('max-tasks', {
			type: 'number',
			describe: '最大任務數，須為正整數',
		})
		.option('from-last-publish', {
			type: 'boolean',
			describe: '以完成紀錄重建續跑狀態',
		})
		.option('publish', {
			type: 'boolean',
			describe: '解除發布停用（預設停用）',
		})
		.option('dry-run', {
			type: 'boolean',
			default: true,
			describe: '第 2 批起僅報告（預設啟用；以 --no-dry-run 解除）',
		})
		.option('close', {
			type: 'boolean',
			describe: '執行結束後關閉瀏覽器',
		})
		.option('create-url', {
			type: 'string',
			describe: '變更上傳（建立貼文）頁面網址',
		})
		.option('ags-max-publish', {
			type: 'number',
			describe: '任務發布次數上限，須為正整數（僅任務模式生效）',
		})
		.option('ags-max-publish-total', {
			type: 'boolean',
			describe: '上限改以完成紀錄累計發布次數判定（須與 --ags-max-publish 併用）',
		})
		.check((args) =>
		{
			/** 正整數校驗：非正整數即判定為錯誤參數（缺少值由 yargs 於取值時攔截） */
			const assertPositiveInteger = (value: unknown, flag: string) =>
			{
				if (value === undefined)
				{
					return;
				}

				const num = typeof value === 'number' ? value : Number(value);

				if (!Number.isInteger(num) || num <= 0)
				{
					throw new Error(`${flag} must be a positive integer`);
				}
			};

			assertPositiveInteger(args.maxTasks, '--max-tasks');
			assertPositiveInteger(args.agsMaxPublish, '--ags-max-publish');

			return true;
		})
		.parseSync();
}
