import { Console2 } from 'debug-color2';

/**
 * 模組日誌標籤 (Log Label)
 *
 * 作為標籤字串的單一來源，使終端輸出可辨識來源模組。
 */
export enum EnumLogLabel
{
	/** 頁面通訊協議 */
	Bridge = '[bridge]',
	/** 瀏覽器自動化基底 */
	BrowserAutomation = '[browser-automation]',
	/** 示範腳本 */
	Temp = '[temp]',
}

/**
 * 建立帶時間戳的日誌
 *
 * 一般日誌不需要時間戳，直接 `import { console } from 'debug-color2'` 即可。
 */
export function createTimedConsole(): Console2
{
	return new Console2(null, {
		label: true,
		time: true,
	});
}

/** 頁面通訊協議的終端日誌：帶 label 與時間戳 */
export const consoleLogger = createTimedConsole();
