import type { IBrowserKind, IHandleBrowserKindResult } from '@lazy-playwright/shared-types';
import type { ITSAnyOfUnion } from 'ts-type';
import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { IFirefoxUserPrefs } from '../firefox/firefox-prefs';

/**
 * 跨瀏覽器設定的投放目標 (Setting Placement)
 *
 * 同一項設定在不同瀏覽器可能落在不同位置（啟動參數 / 啟動選項 / 上下文選項），
 * 以 `placement` 作為判別鍵，讓消費端自行將 payload 置入對應邏輯。
 */
export const enum EnumSettingPlacement
{
	/** `LaunchOptions.args`，語意為附加 (append) */
	Args = 'args',
	/** `LaunchOptions.firefoxUserPrefs`，語意為淺層合併 (shallow merge) */
	FirefoxUserPrefs = 'firefox-user-prefs',
	/** `LaunchOptions` 其餘啟動選項，語意為淺層合併 (shallow merge) */
	LaunchOptions = 'launch-options',
	/** `BrowserContextOptions`，語意為淺層合併 (shallow merge) */
	ContextOptions = 'context-options',
}

export type IBrowserLaunchArgs = readonly string[];

/** 以 `LaunchOptions.args` 投放的設定 */
export interface IBrowserLaunchArgsSetting
{
	placement: EnumSettingPlacement.Args;
	/** 欲附加的啟動參數；空陣列表示無需置入 */
	args: IBrowserLaunchArgs;
}

/** 以 `LaunchOptions.firefoxUserPrefs` 投放的設定 */
export interface IFirefoxUserPrefsSetting
{
	placement: EnumSettingPlacement.FirefoxUserPrefs;
	/** 欲併入的 Firefox 啟動偏好；空物件表示無需置入 */
	firefoxUserPrefs: IFirefoxUserPrefs;
}

/** 以 `LaunchOptions` 其餘選項投放的設定 */
export interface IBrowserLaunchOptionsSetting
{
	placement: EnumSettingPlacement.LaunchOptions;
	/** 欲併入的啟動選項；空物件表示無需置入。巢狀物件（如 `firefoxUserPrefs`）由消費端決定合併方式 */
	launchOptions: Partial<LaunchOptions>;
}

/** 以 `BrowserContextOptions` 投放的設定 */
export interface IBrowserContextOptionsSetting<TContextOptions extends BrowserContextOptions = BrowserContextOptions>
{
	placement: EnumSettingPlacement.ContextOptions;
	/** 欲併入的上下文選項；空物件表示無需置入 */
	contextOptions: TContextOptions;
}

/** 跨瀏覽器設定投放（判別聯集，以 `placement` 區分投放位置） */
export type IBrowserSetting<TContextOptions extends BrowserContextOptions = BrowserContextOptions> = ITSAnyOfUnion<
	IBrowserLaunchArgsSetting
	| IFirefoxUserPrefsSetting
	| IBrowserLaunchOptionsSetting
	| IBrowserContextOptionsSetting<TContextOptions>
>;

/**
 * 設定解析結果：投放內容 + 歸一化的瀏覽器種類
 *
 * 消費端以 `placement` 判別後置入對應位置；
 * payload 為空（空陣列 / 空物件）表示設定已存在或不適用，
 * 可統一以附加 / 淺層合併處理而無需特殊分支。
 */
export type IBrowserSettingResult<TSetting extends IBrowserSetting = IBrowserSetting> = TSetting & Pick<IHandleBrowserKindResult, 'baseKind'>;
