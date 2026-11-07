import { Console2, IStylesColorNames } from 'debug-color2';
import { EnumPostPhase, type IMessageOptions } from './types';
import { ITSReadonlyToWriteableArray } from 'ts-type';

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

/** 終端日誌：帶 label 與時間戳 */
export const consoleLogger = new Console2(null, {
	label: true,
	time: true,
});

/** 終端日誌記錄方法：{@link _logPhase} 與系統提示記錄規則共用的 method 型別（單一來源） */
export type ILogMethod = keyof Pick<Console2, 'log' | 'debug' | 'success' | 'warn' | 'info' | 'error'>;

export type ILogMethodInput = readonly [...style: IStylesColorNames[], method: ILogMethod] | readonly [method: ILogMethod] | ILogMethod;

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
	method: ILogMethodInput = 'log',
): void
{
	if (options?.verbose === false) return;

	const scope = options?.batchNo === undefined ? '' : `[batch ${options.batchNo}] `;
	const text = `[${phase}] ${scope}${message}`;

	let finalConsole = consoleLogger;

	if (Array.isArray(method))
	{
		let methodArray = [...method] as ITSReadonlyToWriteableArray<Extract<ILogMethodInput, readonly any[]>>;
		method = methodArray.pop()! as ILogMethod ?? 'log';

		for (const style of methodArray)
		{
			// @ts-ignore
			finalConsole = finalConsole[style]!;
		}
	}

	finalConsole[method as ILogMethod](EnumLogLabel.CivitaiBot, text);
}
