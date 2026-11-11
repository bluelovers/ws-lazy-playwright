
/** 日期檔案名特徵（`YYYY-MM-DD.json`） */
export const DAY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;/** 可上傳的圖片副檔名；同名的 `.txt` 敘述檔必須排除 */

export const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif)$/i;
/** 任務天目錄名格式（`YYYY-MM-DD`），用以辨識基準路徑為單日或根目錄 */

export const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
/** agent-scheduler 任務目錄特徵（`HH-MM-SS_task(...)`），用以辨識任務資料夾 */

export const TASK_DIR_RE = /_task\(/;
/** agent-scheduler 任務目錄特徵（`agent-scheduler`），用以辨識任務資料夾 */

export const AGENT_SCHEDULER_DIR_RE = /\/agent-scheduler\/?$/;
/**
 * 系統提示中代表「已達上限」的特徵（如「You've reached today's limit of 150 posts.」）
 *
 * 命中即停止任務。
 */

export const LIMIT_RE = /reached\b[^.]*\blimit|daily limit|upload limit/i;

