import { Console2 } from 'debug-color2';
import { EnumPostPhase, type IMessageOptions } from './types';

/**
 * 模組日誌標籤 (Log Label)
 *
 * 作為標籤字串的單一來源，使終端輸出可辨識來源模組。
 */
export enum EnumLogLabel
{
	/** 示範腳本 */
	Temp = '[temp]',
}

/** 終端日誌：帶 label 與時間戳 */
export const consoleLogger = new Console2(null, {
	label: true,
	time: true,
});

/**
 * 以指定階段名義輸出訊息；內容自動反映實際數量，不硬編碼
 *
 * 訊息屬邏輯的一部分：函式被重複使用或組合時依然存在，
 * 僅在需要隱藏時以 {@link IMessageOptions.verbose} 停用。
 */
export function _logPhase(
	phase: EnumPostPhase,
	options: IMessageOptions | undefined,
	message: string,
	method: 'log' | 'debug' | 'success' | 'warn' = 'log',
): void
{
	if (options?.verbose === false) return;

	const scope = options?.batchNo === undefined ? '' : `[batch ${options.batchNo}] `;
	const text = `[${phase}] ${scope}${message}`;

	if (method === 'debug')
	{
		consoleLogger.debug(EnumLogLabel.Temp, text);
	}
	else if (method === 'success')
	{
		consoleLogger.success(EnumLogLabel.Temp, text);
	}
	else if (method === 'warn')
	{
		consoleLogger.warn(EnumLogLabel.Temp, text);
	}
	else
	{
		consoleLogger.log(EnumLogLabel.Temp, text);
	}
}
