import type { ILogMethod } from '@lazy-playwright/logger';

/** 系統提示記錄規則：依標題 / 內文模式決定 log method */
export interface INotificationLogRule
{
	/** 標題模式（省略即不比對標題） */
	title?: RegExp;
	/** 內文模式（省略即不比對內文） */
	description?: RegExp;
	/** 命中時使用的 log method */
	method: ILogMethod;
}

/** 發布後落地頁特徵：`name` 供不同模式提醒識別使用 */
export interface IPublishedUrlPattern
{
	/** 模式名稱（不同模式提醒輸出用） */
	name: string;
	/** 網址特徵 */
	pattern: RegExp;
}

/** 點擊 publish 後等待網址跳轉為已發布貼文的逾時時間（僅等待網址更新，不等待載入完成） */
export const PUBLISH_URL_TIMEOUT = 15_000;

/** 單一 publish 任務最多累計的圖片數（站台上限 20，預留餘裕） */
export const MAX_PER_BATCH = 18;

/** 單次 `setInputFiles` 的檔案總和上限；超過則減少該次上傳數量 */
export const MAX_PACK_BYTES = 5 * 1024 * 1024;

/**
 * 從第幾批開始改為 dry run（僅報告批次內容，不上傳、不進入發布階段）
 *
 * 第 1 批為實際上傳；第 2 批起站台等待區已滿且未經 save / publish 無法清空。
 * 可由 `IRunSwitches.disableDryRun` 於呼叫端解除（CLI `--no-dry-run`）。
 */
export const DRY_RUN_FROM_BATCH = 2;

/** 等待上傳區出現的逾時時間；逾時視為頁面載入失敗或登入失敗 */
export const DROPZONE_WAIT_TIMEOUT = 15_000;

/**
 * 是否執行發布；安全開關，預設 `false`（屬 {@link EnumPostPhase.Publish} 的範圍）
 *
 * 於上傳階段 waiter 結束後才檢查，絕不點擊 save（草稿）按鈕。
 * 可由 `IRunSwitches.enablePublish` 於呼叫端解除（CLI `--publish`）。
 */
export const ENABLE_PUBLISH = false;
