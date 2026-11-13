import { consoleLoggerTimeAndLabel, logConsole, type IConsoleMethodInput, type ILogMethod } from '@lazy-playwright/logger';
import { EnumPostPhase, type IMessageOptions } from './types/types';

/**
 * 模組日誌標籤 (Log Label)
 *
 * 作為標籤字串的單一來源，使終端輸出可辨識來源模組。
 */
export enum EnumLogLabel
{
	/** civitai-bot */
	CivitaiBot = '[civitai-bot]',
}

/**
 * 以指定階段名義輸出訊息；內容自動反映實際數量，不硬編碼
 *
 * 訊息屬邏輯的一部分：函式被重複使用或組合時依然存在，
 * 僅在需要隱藏時以 {@link IMessageOptions} 停用。
 */
export function _logPhase(
	phase: EnumPostPhase,
	options: IMessageOptions | undefined,
	message: string,
	method: IConsoleMethodInput<ILogMethod> = 'log',
): void
{
	if (options?.verbose === false) return;

	const scope = options?.batchNo === undefined ? '' : `[batch ${options.batchNo}] `;
	const text = `[${phase}] ${scope}${message}`;

	logConsole(consoleLoggerTimeAndLabel, method, EnumLogLabel.CivitaiBot, text);
}

/**
 * 併入批次序號至訊息控制：批次報告與上傳比對共用的組裝方式
 *
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param batchNo 批次序號：作為訊息前綴
 */
export function _withBatch(options: IMessageOptions | undefined, batchNo: number): IMessageOptions
{
	return { ...options, batchNo };
}

/**
 * 以 `dir` 輸出資料結構（批次起始 / 結束檔案等）；停用規則與 {@link _logPhase} 一致
 *
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param message 輸出的資料結構
 */
export function _logPhaseData(options: IMessageOptions | undefined, message: unknown): void
{
	if (options?.verbose === false) return;

	consoleLoggerTimeAndLabel.dir(message);
}

