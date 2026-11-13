
/** 日期檔案名特徵（`YYYY-MM-DD.json`） */
export const DAY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** 任務天目錄名格式（`YYYY-MM-DD`），用以辨識基準路徑為單日或根目錄 */
export const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 可上傳的圖片副檔名；同名的 `.txt` 敘述檔必須排除 */
export const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif)$/i;

/** agent-scheduler 任務目錄特徵（`HH-MM-SS_task(...)`），用以辨識任務資料夾 */
export const TASK_DIR_RE = /_task\(/;

/** agent-scheduler 任務目錄特徵（`agent-scheduler`），用以辨識任務資料夾 */
export const AGENT_SCHEDULER_DIR_RE = /\/agent-scheduler\/?$/;


