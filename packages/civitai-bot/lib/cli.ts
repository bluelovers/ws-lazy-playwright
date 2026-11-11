import { consoleLoggerTimeAndLabel } from '@lazy-playwright/logger';
import { parseCliFlags } from './cli-flags';
import type { IParsedFlags } from './cli-flags';
import { EnumLogLabel } from './logger';
import type { IRunSwitches, ITaskRangeOptions } from './types/types';

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
 * 邏輯層：CLI 取值與預設值合併為執行設定（純函式，無副作用）
 *
 * 僅在明確指定的旗標覆寫預設值；未指定者沿用 `defaults`。
 *
 * @param flags CLI 取值（{@link parseCliFlags} 解析結果）
 * @param defaults 預設值（任務基準路徑、任務範圍）
 */
export function resolveAutoPostCli(flags: IParsedFlags, defaults: Partial<IAutoPostCli> = {}): IAutoPostCli
{
	/** 執行設定：僅在明確指定時覆寫預設值 */
	const switches: IRunSwitches = {
		/** 建立貼文頁網址：未指定時沿用 `CREATE_URL` 預設 */
		createUrl: flags.createUrl ?? defaults.switches?.createUrl,
		/** agent-scheduler 任務發布次數上限：未指定時不設限 */
		agsMaxPublish: flags.agsMaxPublish ?? defaults.switches?.agsMaxPublish,
		/** 累計判定旗標：與 `--ags-max-publish` 併用時，上限含完成紀錄中已發布過的次數 */
		...(flags.agsMaxPublishTotal === true && { agsMaxPublishTotal: true }),
		/** `--publish`：解除發布停用 */
		...(flags.publish === true && { enablePublish: true }),
		/** `--no-dry-run`：解除 dry run */
		...(flags.dryRun === false && { disableDryRun: true }),
	};

	return {
		...defaults,
		switches: {
			...defaults.switches,
			...switches,
		},
		taskBase: flags.taskBase ?? defaults.taskBase,
		range: {
			...defaults.range,
			...(flags.maxTasks !== undefined && { maxTasks: flags.maxTasks }),
		},
		fromLastPublish: flags.fromLastPublish ?? defaults.fromLastPublish,
		closeAfter: flags.close ?? defaults.closeAfter,
	};
}

/**
 * 輸出層：CLI 解析結果摘要（I/O，不含解析與合併邏輯）
 *
 * @param cli 解析結果（{@link resolveAutoPostCli} 輸出）
 */
export function logAutoPostCli(cli: IAutoPostCli): void
{
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
}

/**
 * 完整階段：解析 auto-post CLI 參數並輸出摘要
 *
 * 組合三項單一職責，彼此分離：
 *
 * 1. {@link parseCliFlags}（機制層）：yargs 旗標解析與取值驗證，旗標清單見該函式說明
 * 2. {@link resolveAutoPostCli}（邏輯層）：取值與預設值合併為執行設定，純函式
 * 3. {@link logAutoPostCli}（輸出層）：解析結果摘要
 *
 * @param argv CLI 參數（不含執行檔與腳本路徑，通常為 `hideBin(process.argv)`）
 * @param defaults 預設值（任務基準路徑、任務範圍）
 */
export function parseAutoPostCli(argv: readonly string[], defaults?: Partial<IAutoPostCli>): IAutoPostCli
{
	const cli = resolveAutoPostCli(parseCliFlags(argv), defaults);

	logAutoPostCli(cli);

	return cli;
}
