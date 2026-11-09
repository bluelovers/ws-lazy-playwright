
import type { ICreateBrowserAutomationOptions } from './types/types';
import type { ICamoufoxLaunchOptions } from '@lazy-playwright/browser-config/lib/firefox/camoufox-types';

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
