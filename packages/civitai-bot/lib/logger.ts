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

export function _logPhaseData(
	phase: EnumPostPhase,
	options: IMessageOptions | undefined,
	message: any,
	method: 'dir',
): void
{
	if (options?.verbose === false) return;

	consoleLoggerTimeAndLabel.dir(message);
}
