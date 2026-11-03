/** 建立貼文頁 */
export const CREATE_URL = 'https://civitai.red/posts/create';

/** 拖曳與點選的上傳區（Mantine Dropzone） */
export const DROPZONE_SELECTOR = '.mantine-Dropzone-root';

/** 上傳區內建的檔案選擇 input：直接 setInputFiles，不開啟系統檔案選擇窗 */
export const FILE_INPUT_SELECTOR = `${DROPZONE_SELECTOR} input[type="file"]`;

/** 上載完成後才會出現的發布按鈕 */
export const PUBLISH_SELECTOR = 'button[data-tour="post:publish"]';

/** 已發布貼文的網址特徵（`https://civitai.red/posts/<id>`）；跳轉至此即代表發布完成 */
export const POST_URL_RE = /\/posts\/\d+/;

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
