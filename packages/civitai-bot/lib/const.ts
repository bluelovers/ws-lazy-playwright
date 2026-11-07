import type { ILogMethod } from '@lazy-playwright/logger';

/**
 * 建立貼文頁（上傳頁面）網址
 *
 * 可由 `IRunSwitches.createUrl` 於呼叫端覆寫（CLI `--create-url`）。
 */
export const CREATE_URL = 'https://civitai.red/posts/create';

/** 拖曳與點選的上傳區（Mantine Dropzone） */
export const DROPZONE_SELECTOR = '.mantine-Dropzone-root';

/** 上傳區內建的檔案選擇 input：直接 setInputFiles，不開啟系統檔案選擇窗 */
export const FILE_INPUT_SELECTOR = `${DROPZONE_SELECTOR} input[type="file"]`;

/** 上載完成後才會出現的發布按鈕 */
export const PUBLISH_SELECTOR = 'button[data-tour="post:publish"]';

/** 系統提示（Mantine Notifications）單則元素：標題 `.mantine-Notification-title`、內文 `.mantine-Notification-description` */
export const NOTIFICATION_SELECTOR = '.mantine-Notifications-notification';

/**
 * 系統提示中代表「已達上限」的特徵（如「You've reached today's limit of 150 posts.」）
 *
 * 命中即停止任務。
 */
export const LIMIT_RE = /reached\b[^.]*\blimit|daily limit|upload limit/i;

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

/**
 * 系統提示記錄規則表（由上而下取第一筆命中；皆未命中以 `warn` 記錄）
 *
 * 單筆規則中已存在的模式皆須命中（AND），未存在的模式略過。
 */
export const NOTIFICATION_LOG_RULES: readonly INotificationLogRule[] = [
	/** 建立貼文失敗（如「Failed to create post」） */
	{ title: /Failed to create post/i, method: 'error' },
	/** 已達上限（如「You've reached today's limit of 150 posts.」；同時觸發停止任務） */
	{ description: LIMIT_RE, method: 'error' },
];

/** 發布後落地頁特徵：`name` 供不同模式提醒識別使用 */
export interface IPublishedUrlPattern
{
	/** 模式名稱（不同模式提醒輸出用） */
	name: string;
	/** 網址特徵 */
	pattern: RegExp;
}

/**
 * 發布後到達的落地頁特徵：網址符合任一即代表發布完成
 *
 * 清單首位為預期模式，其餘視為不同模式（命中時以 warn 提醒）：
 *
 * - `posts`：貼文頁 `https://civitai.red/posts/<id>`（預期）
 * - `models`：模型頁 `https://civitai.red/models/<id>/<slug>?modelVersionId=<id>`（不同模式）
 *
 * 依發布來源不同，落地頁可能有差異。
 */
export const PUBLISHED_URL_PATTERNS: readonly IPublishedUrlPattern[] = [
	{ name: 'posts', pattern: /\/posts\/\d+/ },
	{ name: 'models', pattern: /\/models\/\d+/ },
];

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

/** 可上傳的圖片副檔名；同名的 `.txt` 敘述檔必須排除 */
export const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif)$/i;

/** 任務天目錄名格式（`YYYY-MM-DD`），用以辨識基準路徑為單日或根目錄 */
export const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** agent-scheduler 任務目錄特徵（`HH-MM-SS_task(...)`），用以辨識任務資料夾 */
export const TASK_DIR_RE = /_task\(/;
