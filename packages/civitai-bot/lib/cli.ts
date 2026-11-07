import { consoleLoggerTimeAndLabel } from '@lazy-playwright/logger';
import { EnumLogLabel } from './logger';
import type { IRunSwitches, ITaskRangeOptions } from './types';

/** CLI 參數讀取：布林旗標 / 字串值 / 正整數值三種取值 */
export interface ICliArgs
{
	/** 旗標是否存在（完全比對 token） */
	has(name: string): boolean;
	/** 字串參數值：支援 `--name value` 與 `--name=value`；未指定、缺少值或下一個 token 為旗標時回傳 `undefined` */
	value(name: string): string | undefined;
	/** 正整數參數值：未指定、非正整數時回傳 `undefined` */
	int(name: string): number | undefined;
}

/**
 * 建立 CLI 參數讀取器
 *
 * @param argv CLI 參數（不含執行檔與腳本路徑，通常為 `process.argv.slice(2)`）
 */
export function createCliArgs(argv: readonly string[]): ICliArgs
{
	const args = new Set(argv);

	/** 取得字串參數值：`--name value` 與 `--name=value` 皆可 */
	const value = (name: string): string | undefined =>
	{
		const prefix = `${name}=`;
		const inline = argv.find(arg => arg.startsWith(prefix));

		if (inline !== undefined)
		{
			return inline.slice(prefix.length) || undefined;
		}

		const index = argv.indexOf(name);
		const raw = index >= 0 ? argv[index + 1] : undefined;

		return raw !== undefined && !raw.startsWith('--') ? raw : undefined;
	};

	/** 取得正整數參數值：非正整數或未指定時回傳 `undefined` */
	const int = (name: string): number | undefined =>
	{
		const raw = value(name);
		const parsed = raw === undefined ? Number.NaN : Number(raw);

		return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
	};

	return {
		has: name => args.has(name),
		value,
		int,
	};
}

/** auto-post CLI 預設值：CLI 未指定時採用 */
export interface IAutoPostCliDefaults
{
	/** 任務基準路徑預設值（`--task-base` 未指定時） */
	taskBase: string;
	/** 任務範圍預設值（`--max-tasks` 合併入內，不修改傳入物件） */
	range?: ITaskRangeOptions;
}

/** auto-post CLI 解析結果 */
export interface IAutoPostCli
{
	/** 執行設定（`--publish` / `--no-dry-run` / `--create-url` / `--ags-max-publish` / `--ags-max-publish-total`） */
	switches: IRunSwitches;
	/** 任務基準路徑（`--task-base`） */
	taskBase: string;
	/** 任務範圍（`--max-tasks` 已合併入預設範圍） */
	range: ITaskRangeOptions;
	/** 是否以完成紀錄重建續跑狀態（`--from-last-publish`） */
	fromLastPublish: boolean;
	/** 執行結束後關閉瀏覽器（`--close`） */
	closeAfter: boolean;
}

/**
 * 完整階段：解析 auto-post CLI 參數並輸出摘要
 *
 * CLI 參數（`argv`）：
 *
 * 通用：
 *
 * - `--task-base <path>`：任務基準路徑（預設為 `defaults.taskBase`）
 * - `--max-tasks <n>`：最大任務數（合併入 `defaults.range`）
 * - `--from-last-publish`：以完成紀錄補齊進度缺漏的完成邊界（已完成任務不重發）；
 *   另於無可接續紀錄時找尋新任務起始點（覆寫 startDay / startTask）
 * - `--publish`：解除發布停用（預設停用；絕不按 save 的安全規則不變）
 * - `--no-dry-run`：解除 dry run（預設第 2 批起僅報告）
 * - `--close`：執行結束後關閉瀏覽器（`automation.close()`）
 * - `--create-url <url>`：變更上傳（建立貼文）頁面網址（預設 `CREATE_URL`）
 *
 * agent-scheduler 專用（`--ags-` prefix）：
 *
 * - `--ags-max-publish <n>`：任務的發布次數上限，達上限即忽略剩餘圖片（僅任務模式生效，預設不限制）
 * - `--ags-max-publish-total`：上限改以完成紀錄的累計發布次數判定（含該任務已發布過的次數，
 *   已達上限的任務不再發布；須與 `--ags-max-publish` 併用，否則不生效）
 *
 * 解析完成即輸出摘要（debug / info 各一行）。
 *
 * @param argv CLI 參數（不含執行檔與腳本路徑）
 * @param defaults 預設值（任務基準路徑、任務範圍）
 */
export function parseAutoPostCli(argv: readonly string[], defaults: IAutoPostCliDefaults): IAutoPostCli
{
	const args = createCliArgs(argv);

	/** 執行設定：僅在明確指定時覆寫預設值 */
	const switches: IRunSwitches = {
		/** 建立貼文頁網址：未指定時沿用 `CREATE_URL` 預設 */
		createUrl: args.value('--create-url'),
		/** agent-scheduler 任務發布次數上限：未指定或無效值不設限 */
		agsMaxPublish: args.int('--ags-max-publish'),
	};

	/** 累計判定旗標：與 `--ags-max-publish` 併用時，上限含完成紀錄中已發布過的次數 */
	if (args.has('--ags-max-publish-total'))
	{
		switches.agsMaxPublishTotal = true;
	}

	if (args.has('--publish'))
	{
		switches.enablePublish = true;
	}

	if (args.has('--no-dry-run'))
	{
		switches.disableDryRun = true;
	}

	/** CLI `--max-tasks <n>`：未指定或非正整數時不覆寫 */
	const maxTasks = args.int('--max-tasks');

	const cli: IAutoPostCli = {
		switches,
		taskBase: args.value('--task-base') ?? defaults.taskBase,
		range: {
			...defaults.range,
			...(maxTasks !== undefined && { maxTasks }),
		},
		fromLastPublish: args.has('--from-last-publish'),
		closeAfter: args.has('--close'),
	};

	// consoleLoggerTimeAndLabel.debug(
	// 	EnumLogLabel.CivitaiBot,
	// 	`[auto-post] cli: publish=${cli.switches.enablePublish === true}`
	// 	+ `, dryRun=${cli.switches.disableDryRun === true ? 'off' : 'on'}`
	// 	+ `, close=${cli.closeAfter}`
	// 	+ `, createUrl=${cli.switches.createUrl ?? 'default'}`
	// 	+ `, agsMaxPublish=${cli.switches.agsMaxPublish ?? 'none'}`
	// 	+ `${cli.switches.agsMaxPublishTotal ? ' (total)' : ''}`,
	// );

	// consoleLoggerTimeAndLabel.info(
	// 	EnumLogLabel.CivitaiBot,
	// 	`[auto-post] cli scan: taskBase=${cli.taskBase}`
	// 	+ `, maxTasks=${cli.range.maxTasks ?? 'none'}`
	// 	+ `, fromLastPublish=${cli.fromLastPublish}`,
	// );

	consoleLoggerTimeAndLabel.debug(
		EnumLogLabel.CivitaiBot,
		`[auto-post] cli:`,
	);

	consoleLoggerTimeAndLabel.dir(cli, { depth: null });



	return cli;
}
