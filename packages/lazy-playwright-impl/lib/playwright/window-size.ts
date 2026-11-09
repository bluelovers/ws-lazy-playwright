import { EnumBrowserKind } from '@lazy-playwright/shared-types';
import type { IWindowSize } from '../types/types';

/**
 * 視窗尺寸的命令參數風格 (Window Size Style)
 *
 * 決定尺寸以哪一種 CLI 寫法輸出與解析。
 */
export const enum EnumWindowSizeStyle
{
	/** Chromium 系：`--window-size=寬,高` */
	Chromium = 'chromium',
	/** Firefox 系：`-width 寬 -height 高` */
	Firefox = 'firefox',
}

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
	/** 瀏覽器種類，決定命令參數風格 */
	kind: EnumBrowserKind;
	/** 建立選項指定的預設視窗尺寸 */
	windowSize?: IWindowSize | null;
	/** 已存在的啟動參數 */
	args?: readonly string[];
}

/** 視窗尺寸的解析結果 */
export interface IResolveWindowSizeResult
{
	style: EnumWindowSizeStyle;
	size: IWindowSize | null;
	source: EnumWindowSizeSource | null;
}

/** 由瀏覽器種類決定命令參數風格；Firefox 之外皆以 Chromium 寫法處理 */
export function resolveWindowSizeStyle(kind: EnumBrowserKind): EnumWindowSizeStyle
{
	return kind === EnumBrowserKind.Firefox
		? EnumWindowSizeStyle.Firefox
		: EnumWindowSizeStyle.Chromium;
}

/** 取得相反風格，供交叉解析使用 */
function _oppositeWindowSizeStyle(style: EnumWindowSizeStyle): EnumWindowSizeStyle
{
	return style === EnumWindowSizeStyle.Firefox
		? EnumWindowSizeStyle.Chromium
		: EnumWindowSizeStyle.Firefox;
}

/**
 * 讀取旗標值，同時支援 `-flag value` 與 `-flag=value` 兩種寫法
 *
 * @returns 找不到旗標或缺少值時回傳 `null`
 */
function _readFlagValue(args: readonly string[], flag: string): string | null
{
	for (let i = 0; i < args.length; i++)
	{
		const arg = args[i];

		if (arg === flag)
		{
			return args[i + 1] ?? null;
		}
		else if (arg.startsWith(`${flag}=`))
		{
			return arg.slice(flag.length + 1);
		}
	}

	return null;
}

function _toPositiveInt(value: string | null): number | null
{
	if (!value) return null;

	const n = Number(value.trim());

	return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 依命令參數風格解析視窗尺寸
 *
 * 找不到旗標、缺值或數值不合法時回傳 `null`。
 */
function _parseWindowSizeArgs(style: EnumWindowSizeStyle, args: readonly string[]): IWindowSize | null
{
	if (style === EnumWindowSizeStyle.Firefox)
	{
		const width = _toPositiveInt(_readFlagValue(args, '-width'));
		const height = _toPositiveInt(_readFlagValue(args, '-height'));

		return width !== null && height !== null
			? { width, height }
			: null;
	}

	const pair = _readFlagValue(args, '--window-size');

	if (!pair) return null;

	const [width, height] = pair.split(',');
	const w = _toPositiveInt(width);
	const h = _toPositiveInt(height);

	return w !== null && h !== null
		? { width: w, height: h }
		: null;
}

/**
 * 依 `kind` 輸出對應風格的視窗尺寸命令參數
 *
 * @param kind - 瀏覽器種類，決定輸出風格
 * @param size - 視窗尺寸
 * @returns 依風格產出的參數陣列
 */
export function windowSizeArgs(kind: EnumBrowserKind, size: IWindowSize): string[]
{
	if (resolveWindowSizeStyle(kind) === EnumWindowSizeStyle.Firefox)
	{
		return [
			'-width', String(size.width),
			'-height', String(size.height),
		];
	}

	return [`--window-size=${size.width},${size.height}`];
}

/**
 * 決定最終使用的視窗尺寸與其來源
 *
 * 優先序：`args` 內的自身風格參數 > 建立選項 `windowSize` > 另一風格的參數。
 * 交叉解析讓 `viewport: null` 下傳入任一種寫法都能生效。
 */
export function resolveWindowSize(options: IResolveWindowSizeOptions): IResolveWindowSizeResult
{
	const { kind, windowSize, args = [] } = options;
	const style = resolveWindowSizeStyle(kind);

	const own = _parseWindowSizeArgs(style, args);

	if (own)
	{
		return { style, size: own, source: EnumWindowSizeSource.Args };
	}

	if (windowSize)
	{
		return { style, size: windowSize, source: EnumWindowSizeSource.Option };
	}

	const cross = _parseWindowSizeArgs(_oppositeWindowSizeStyle(style), args);

	if (cross)
	{
		return { style, size: cross, source: EnumWindowSizeSource.CrossStyle };
	}

	return { style, size: null, source: null };
}

/**
 * 依 `kind` 產出應附加的視窗尺寸啟動參數
 *
 * `args` 已含自身風格參數時回傳空陣列，維持呼叫端優先權、不重複輸出。
 */
export function windowSizeLaunchArgs(options: IResolveWindowSizeOptions): string[]
{
	const { kind } = options;
	const { size, source } = resolveWindowSize(options);

	if (!size || source === EnumWindowSizeSource.Args)
	{
		return [];
	}

	return windowSizeArgs(kind, size);
}
