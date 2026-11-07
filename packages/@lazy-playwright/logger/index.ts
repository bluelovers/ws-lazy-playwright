
import { Console2, IOptionsColorsProp, IStylesColorNames } from 'debug-color2';
import { methods } from 'debug-color2/lib/fill-property';
import { ITSReadonlyToWriteableArray } from 'ts-type';

/**
 * 日誌方法名稱：Console2 常用輸出方法
 */
// export type ILogMethod = keyof Pick<Console2, 'log' | 'debug' | 'success' | 'warn' | 'info' | 'error'>;
export type ILogMethod = Extract<IOptionsColorsProp, 'log' | 'debug' | 'success' | 'warn' | 'info' | 'error'>;

/**
 * logConsole 的 method 參數輸入形式：
 *
 * - 方法名稱，如 'warn'
 * - 僅含方法的陣列，如 ['error']
 * - 樣式置前、方法置於尾端的陣列，如 ['yellow', 'success']
 */
export type IConsoleMethodInput<M extends IOptionsColorsProp = IOptionsColorsProp> = M | readonly [...style: IStylesColorNames[], method: M] | readonly [method: M] | readonly (IStylesColorNames | M)[];

/**
 * {@link _handleConsoleMethodInput} 解析 {@link IConsoleMethodInput} 後的結果
 */
export interface IConsoleMethodInputResult<M extends IOptionsColorsProp = IOptionsColorsProp>
{
	/** 套用樣式後的 Console2 實例 */
	console: Console2;
	/** 解析後的方法名稱 */
	method: M;
	/** 依序套用的樣式清單，無樣式時為空陣列 */
	style: IStylesColorNames[];
}

/**
 * 檢查是否為有效的 Console2 方法
 */
export function _isConsoleMethod(method: unknown): method is IOptionsColorsProp
{
	return methods.includes(method as any);
}

/**
 * 解析 {@link IConsoleMethodInput}：將方法名稱或樣式陣列正規化為
 * 套用樣式後的 Console2、方法名稱與樣式清單
 *
 * @param console - 目標 Console2 實例
 * @param method - 輸入形式（見 {@link IConsoleMethodInput}），省略時以 'log' 輸出
 */
export function _handleConsoleMethodInput<M extends IOptionsColorsProp = IOptionsColorsProp>(console: Console2, method?: IConsoleMethodInput<M>): IConsoleMethodInputResult<M>
{
	let finalConsole: Console2 = console;
	let styleArray: IStylesColorNames[] = [];

	/**
	 * 陣列輸入以尾端元素為方法、其餘元素為樣式；
	 * 輸入為 readonly 陣列，複製成可變陣列才能 pop，同時不改動呼叫端的陣列
	 */
	if (Array.isArray(method))
	{
		let methodArray = [...method] as ITSReadonlyToWriteableArray<Extract<IConsoleMethodInput, readonly any[]>>;
		// @ts-ignore
		method = methodArray.pop()! as M;

		/**
		 * 樣式以屬性鏈依序疊加，
		 * ['yellow', 'bgGreen'] 最終呼叫 console.yellow.bgGreen.log(...)
		 */
		for (const style of methodArray)
		{
			// @ts-ignore
			finalConsole = finalConsole[style]!;
			styleArray.push(style as IStylesColorNames);
		}

		/**
		 * 如果最後一個元素不是方法，則將其視為樣式
		 */
		if (!_isConsoleMethod(method))
		{
			styleArray.push(method as any as IStylesColorNames);
			method = void 0;
		}
	}

	return {
		console: finalConsole,
		/** 陣列輸入若未含方法元素（如空陣列），pop 得到 undefined，一併落回 'log' */
		method: (method ?? 'log') as M,
		style: styleArray,
	};
}

/**
 * 以指定的日誌方法輸出訊息；未傳入 method 時以 'log' 輸出
 *
 * @param console - 目標 Console2 實例
 * @param method - 方法名稱或樣式陣列，形式見 {@link IConsoleMethodInput}
 * @param args - 傳給方法的輸出內容
 *
 * @example
 * ```typescript
 * import { logConsole, consoleLoggerBase } from '@lazy-playwright/logger';
 *
 * logConsole(consoleLoggerBase, 'warn', 'task failed');
 * logConsole(consoleLoggerBase, ['yellow', 'success'], 'range resolved');
 * logConsole(consoleLoggerBase, ['yellow', 'bgGreen'], 'range resolved');
 * ```
 */
export function logConsole<M extends IOptionsColorsProp = IOptionsColorsProp>(console: Console2, method?: IConsoleMethodInput<M>, ...args: any[])
{
	const { console: finalConsole, method: finalMethod } = _handleConsoleMethodInput(console, method);
	finalConsole[finalMethod](...args);
}

/** 基礎日誌實例，不帶任何額外標籤或時間戳 */
export const consoleLoggerBase = new Console2();

/** 終端日誌：啟用 label 與 time 選項，帶標籤與時間戳 */
export const consoleLoggerTimeAndLabel = new Console2(null, {
	label: true,
	time: true,
});

/** 終端日誌：僅啟用 label 選項，帶標籤、無時間戳 */
export const consoleLoggerLabelOnly = new Console2(null, {
	label: true,
	time: false,
});

/** 終端日誌：僅啟用 time 選項，帶時間戳、無標籤 */
export const consoleLoggerTimeOnly = new Console2(null, {
	label: false,
	time: true,
});

export default logConsole;
