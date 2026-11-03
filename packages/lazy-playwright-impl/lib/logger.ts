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

/** 頁面通訊協議的終端日誌：帶 label 與時間戳 */
export const consoleLogger = new Console2(null, {
	label: true,
	time: true,
});

/** 頁面通訊協議的終端日誌：僅帶 label，無時間戳 */
export const consoleLoggerLabelOnly = new Console2(null, {
	label: true,
	time: false,
});

export const consoleLoggerTimeOnly = new Console2(null, {
	label: false,
	time: true,
});
