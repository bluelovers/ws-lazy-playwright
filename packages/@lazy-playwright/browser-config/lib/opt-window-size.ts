import { _handleBrowserKind, EnumAutomationEngine, IHandleBrowserKindResult, type IBrowserKind } from '@lazy-playwright/shared-types';
import {
	EnumSettingPlacement,
	IBrowserLaunchArgsWriteable,
	type IBrowserLaunchArgs,
	type IBrowserLaunchArgsSetting,
	type IBrowserSettingResult,
} from './types/browser-setting';
import { registerUnsupportedCliArgs } from './util/cli-args-filter';
import { ITSPartialPick } from 'ts-type';

/** 視窗尺寸 (Window Size)，單位為像素 */
export interface IWindowSize
{
	width: number;
	height: number;
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
export type IResolveWindowSizeOptions = Partial<Pick<IHandleBrowserKindResult, 'browserEngine' | 'baseKind'> &
{
	/** 建立選項指定的預設視窗尺寸 */
	windowSize?: IWindowSize;
} & Omit<IBrowserLaunchArgsSetting, 'placement'>>;

/**
 * 視窗尺寸的解析結果
 *
 * `args` 為應附加的啟動參數，遵循 {@link IBrowserSettingResult} 約定：
 * 已存在自身風格參數或無可用尺寸時為空陣列（無需置入）。
 * `size` 與 `source` 補充解析出的尺寸與其來源，無可用尺寸時皆為 `undefined`。
 */
export type IResolveWindowSizeResult = IBrowserSettingResult<IBrowserLaunchArgsSetting> & {
	/** 已解析出的視窗尺寸；無可用尺寸時為 `undefined` */
	size?: IWindowSize;
	/** 尺寸的解析來源；無可用尺寸時為 `undefined` */
	source?: EnumWindowSizeSource;
};

/**
 * 讀取旗標值，同時支援 `-flag value` 與 `-flag=value` 兩種寫法
 *
 * @returns 找不到旗標或缺少值時回傳 `undefined`
 */
function _readFlagValue(args: IBrowserLaunchArgs, flag: string): string | undefined
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

/** 寬高皆為正整數時組成視窗尺寸；任一缺失或不合法時回傳 `undefined` */
function _toSize(width: string | undefined, height: string | undefined): IWindowSize | undefined
{
	const w = _toPositiveInt(width);
	const h = _toPositiveInt(height);

	return w && h ? { width: w, height: h } : undefined;
}

/** 依 baseKind 解析視窗尺寸；缺旗標、缺值或數值不合法時回傳 `undefined` */
function _parse(baseKind: IBrowserKind, args: IBrowserLaunchArgs): IWindowSize | undefined
{
	if (baseKind === EnumAutomationEngine.Firefox)
	{
		return _toSize(_readFlagValue(args, '-width'), _readFlagValue(args, '-height'));
	}

	const pair = _readFlagValue(args, '--window-size');

	if (!pair) return undefined;

	const [width, height] = pair.split(',');

	return _toSize(width, height);
}

/** 依 baseKind 輸出對應的視窗尺寸命令參數 */
export function _windowSizeArgs(baseKind: IBrowserKind, size: IWindowSize): IBrowserLaunchArgsWriteable
{
	if (baseKind === EnumAutomationEngine.Firefox)
	{
		/** 數值需轉為字串：啟動參數契約為 `string[]`，過濾等字串操作遇數值會拋錯 */
		return ['-width', String(size.width), '-height', String(size.height)];
	}

	return [`--window-size=${size.width},${size.height}`];
}

/**
 * 決定最終使用的視窗尺寸與其投放內容
 *
 * 優先序：`args` 內的自身風格參數 > 建立選項 `windowSize` > 另一風格的參數。
 * 交叉解析讓傳入任一種寫法都能生效。
 *
 * 回傳符合 {@link IBrowserSettingResult} 的投放結果：
 * 已含自身風格參數或無可用尺寸時 `args` 為空陣列，消費端可統一以附加處理。
 */
export function resolveWindowSize(options: IResolveWindowSizeOptions): IResolveWindowSizeResult
{
	const { windowSize, args = [] } = options;
	const { baseKind } = options.baseKind ? options : _handleBrowserKind(options.browserEngine);

	const own = _parse(baseKind, args);

	if (own)
	{
		/** 自身風格參數已存在 → 空 payload，不重複輸出 */
		return {
			baseKind,
			placement: EnumSettingPlacement.Args,
			args: [],
			size: own,
			source: EnumWindowSizeSource.Args,
		};
	}

	if (windowSize)
	{
		return {
			baseKind,
			placement: EnumSettingPlacement.Args,
			args: _windowSizeArgs(baseKind, windowSize),
			size: windowSize,
			source: EnumWindowSizeSource.Option,
		};
	}

	/**
	 * 另一風格的 baseKind：自身風格無尺寸參數時改以它讀取，
	 * 使 `-width/-height` 與 `--window-size` 兩種寫法皆能解析出尺寸。
	 */
	const crossBaseKind: IBrowserKind = baseKind === EnumAutomationEngine.Firefox
		? EnumAutomationEngine.Chromium
		: EnumAutomationEngine.Firefox;
	const cross = _parse(crossBaseKind, args);

	if (cross)
	{
		return {
			baseKind,
			placement: EnumSettingPlacement.Args,
			args: _windowSizeArgs(baseKind, cross),
			size: cross,
			source: EnumWindowSizeSource.CrossStyle,
		};
	}

	return { baseKind, placement: EnumSettingPlacement.Args, args: [] };
}

/**
 * 產出應附加的視窗尺寸啟動參數
 *
 * `args` 已含自身風格參數或無可用尺寸時回傳空陣列，維持呼叫端優先權、不重複輸出。
 */
export function windowSizeLaunchArgs(options: IResolveWindowSizeOptions): IBrowserLaunchArgsWriteable
{
	return resolveWindowSize(options).args as IBrowserLaunchArgsWriteable;
}
