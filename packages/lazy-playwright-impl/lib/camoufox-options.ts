import type { launchOptions } from 'camoufox-js';
import type { ICreateBrowserAutomationOptions } from './types';

/**
 * `camoufox-js` 的啟動選項型別
 *
 * 直接由依賴的函式簽章推導，避免在此重複定義一份會隨版本漂移的副本。
 */
export type ICamoufoxLaunchOptions = NonNullable<Parameters<typeof launchOptions>[0]>;

/** Camoufox 支援的作業系統 (Operating System) */
export enum EnumCamoufoxOs
{
	Windows = 'windows',
	Linux = 'linux',
	Macos = 'macos',
}

/** Camoufox 建立選項：於 {@link ICreateBrowserAutomationOptions} 之上加入 Camoufox 專屬設定 */
export interface ICamoufoxBrowserAutomationOptions extends ICreateBrowserAutomationOptions
{
	/** Camoufox 專屬啟動選項，會覆蓋預設值 */
	camoufox?: ICamoufoxLaunchOptions;
	/**
	 * 作業系統
	 *
	 * 未提供時交由 `camoufox-js` 決定，本模組不進行環境偵測。
	 */
	os?: EnumCamoufoxOs;
}
