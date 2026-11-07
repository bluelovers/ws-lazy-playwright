
import { Console2, IOptionsColorsProp, IStylesColorNames } from 'debug-color2';
import { ITSReadonlyToWriteableArray } from 'ts-type';

// export type ILogMethod = keyof Pick<Console2, 'log' | 'debug' | 'success' | 'warn' | 'info' | 'error'>;
export type ILogMethod = Extract<IOptionsColorsProp, 'log' | 'debug' | 'success' | 'warn' | 'info' | 'error'>;

export type IConsoleMethodInput<M extends IOptionsColorsProp = IOptionsColorsProp> = readonly [...style: IStylesColorNames[], method: M] | readonly [method: M] | M;

export interface IConsoleMethodInputResult<M extends IOptionsColorsProp = IOptionsColorsProp>
{
	console: Console2;
	method: M;
	style: IStylesColorNames[];
}

export function _handleConsoleMethodInput<M extends IOptionsColorsProp = IOptionsColorsProp>(console: Console2, method?: IConsoleMethodInput<M>): IConsoleMethodInputResult<M>
{
	let finalConsole: Console2 = console;
	let styleArray: IStylesColorNames[] = [];

	if (Array.isArray(method))
	{
		let methodArray = [...method] as ITSReadonlyToWriteableArray<Extract<IConsoleMethodInput, readonly any[]>>;
		// @ts-ignore
		method = methodArray.pop()!;

		for (const style of methodArray)
		{
			// @ts-ignore
			finalConsole = finalConsole[style]!;
			styleArray.push(style as IStylesColorNames);
		}
	}

	return {
		console: finalConsole,
		method: (method ?? 'log') as M,
		style: styleArray,
	};
}

export function logConsole<M extends IOptionsColorsProp = IOptionsColorsProp>(console: Console2, method?: IConsoleMethodInput<M>, ...args: any[])
{
	const { console: finalConsole, method: finalMethod } = _handleConsoleMethodInput(console, method);
	finalConsole[finalMethod](...args);
}

/** 基礎日誌實例，不帶任何額外標籤或時間戳 */
export const consoleLoggerBase = new Console2();

/** 終端日誌：帶 label 與時間戳 */
export const consoleLoggerTimeAndLabel = new Console2(null, {
	label: true,
	time: true,
});

/** 終端日誌：僅帶 label，無時間戳 */
export const consoleLoggerLabelOnly = new Console2(null, {
	label: true,
	time: false,
});

/** 終端日誌：僅帶時間戳，無 label */
export const consoleLoggerTimeOnly = new Console2(null, {
	label: false,
	time: true,
});

export default logConsole;
