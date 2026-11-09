import type { launchOptions } from 'camoufox-js';

/**
 * `camoufox-js` 的啟動選項型別
 *
 * 直接由依賴的函式簽章推導，避免在此重複定義一份會隨版本漂移的副本。
 */
export type ICamoufoxLaunchOptions = NonNullable<Parameters<typeof launchOptions>[0]>;
