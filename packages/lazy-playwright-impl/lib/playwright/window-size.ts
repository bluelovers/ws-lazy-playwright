import { _handleBrowserKind, EnumAutomationEngine, type IBrowserKind } from '@lazy-playwright/shared-types';
import type { IWindowSize } from '../types/types';

/**
 * 視窗尺寸的解析來源 (Window Size Source)
 *
 * 用於區分尺寸由何處決定，避免把已存在的參數再輸出一次。
 */
export const enum EnumWindowSizeSource
{
	/** `args` 內已存在自身風格參數 */
	Args = 'args',
	/** 建立選項 `windowSize` */
	Option = 'option',
	/** 由另一風格的參數轉換而來 */
	CrossStyle = 'cross-style',
}

/** 決定視窗尺寸參數的輸入 */
export interface IResolveWindowSizeOptions
{
	/** 引擎 / 瀏覽器種類，由 {@link _handleBrowserKind} 歸一化為 `baseKind` */
	browserEngine: EnumAutomationEngine;
	/** 建立選項指定的預設視窗尺寸 */
	windowSize?: IWindowSize;
	/** 已存在的啟動參數 */
	args?: readonly string[];
}

/** 視窗尺寸的解析結果；無可用尺寸時 `size` 與 `source` 皆為 `undefined` */
export interface IResolveWindowSizeResult
{
	baseKind: IBrowserKind;
	size?: IWindowSize;
	source?: EnumWindowSizeSource;
}

/**
 * 讀取旗標值，同時支援 `-flag value` 與 `-flag=value` 兩種寫法
 *
 * @returns 找不到旗標或缺少值時回傳 `undefined`
 */
function _readFlagValue(args: readonly string[], flag: string): string | undefined
{
	for (let i = 0; i < args.length; i++)
	{
		const arg = args[i];

		if (arg === flag)
		{
			return args[i + 1];
		}
		else if (arg.startsWith(`${flag}=`))
		{
			return arg.slice(flag.length + 1);
		}
	}
}

function _toPositiveInt(value: string | undefined): number | undefined
{
	if (!value) return undefined;

	const n = Number(value.trim());

	return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** 依 baseKind 解析視窗尺寸；缺旗標、缺值或數值不合法時回傳 `undefined` */
function _parse(baseKind: IBrowserKind, args: readonly string[]): IWindowSize | undefined
{
	if (baseKind === EnumAutomationEngine.Firefox)
	{
		const width = _toPositiveInt(_readFlagValue(args, '-width'));
		const height = _toPositiveInt(_readFlagValue(args, '-height'));

		return width !== undefined && height !== undefined ? { width, height } : undefined;
	}

	const pair = _readFlagValue(args, '--window-size');

	if (!pair) return undefined;

	const [width, height] = pair.split(',');
	const w = _toPositiveInt(width);
	const h = _toPositiveInt(height);

	return w !== undefined && h !== undefined ? { width: w, height: h } : undefined;
}

/** 依 baseKind 輸出對應的視窗尺寸命令參數 */
export function windowSizeArgs(baseKind: IBrowserKind, size: IWindowSize): string[]
{
	if (baseKind === EnumAutomationEngine.Firefox)
	{
		return ['-width', String(size.width), '-height', String(size.height)];
	}

	return [`--window-size=${size.width},${size.height}`];
}

/**
 * 決定最終使用的視窗尺寸與其來源
 *
 * 優先序：`args` 內的自身風格參數 > 建立選項 `windowSize` > 另一風格的參數。
 * 交叉解析讓傳入任一種寫法都能生效。
 */
export function resolveWindowSize(options: IResolveWindowSizeOptions): IResolveWindowSizeResult
{
	const { browserEngine, windowSize, args = [] } = options;
	const { baseKind } = _handleBrowserKind(browserEngine);

	const own = _parse(baseKind, args);

	if (own)
	{
		return { baseKind, size: own, source: EnumWindowSizeSource.Args };
	}

	if (windowSize)
	{
		return { baseKind, size: windowSize, source: EnumWindowSizeSource.Option };
	}

	const crossBaseKind: IBrowserKind = baseKind === EnumAutomationEngine.Firefox
		? EnumAutomationEngine.Chromium
		: EnumAutomationEngine.Firefox;
	const cross = _parse(crossBaseKind, args);

	if (cross)
	{
		return { baseKind, size: cross, source: EnumWindowSizeSource.CrossStyle };
	}

	return { baseKind };
}

/**
 * 產出應附加的視窗尺寸啟動參數
 *
 * `args` 已含自身風格參數時回傳空陣列，維持呼叫端優先權、不重複輸出。
 */
export function windowSizeLaunchArgs(options: IResolveWindowSizeOptions): string[]
{
	const { baseKind, size, source } = resolveWindowSize(options);

	if (!size || source === EnumWindowSizeSource.Args)
	{
		return [];
	}

	return windowSizeArgs(baseKind, size);
}
