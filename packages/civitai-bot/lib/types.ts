/** 單一待上傳檔案：路徑與大小（供 5MB 總和切包） */
export interface IUploadItem
{
	path: string;
	size: number;
}

/**
 * 任務範圍設定：以獨立物件傳入（不併入既有參數），相容未來擴充
 */
export interface ITaskRangeOptions
{
	/**
	 * 起始天（`YYYY-MM-DD`，含）
	 *
	 * 基準路徑為單日目錄時預設該日；為根目錄時必填。
	 */
	startDay?: string;
	/** 結束天（`YYYY-MM-DD`，含）；未指定則不限制 */
	endDay?: string;
	/** 起始任務名稱：起始天內跳過此任務之前的任務（找不到時保留該天全部任務） */
	startTask?: string;
	/** 最大任務數量；未指定則不限制 */
	maxTasks?: number;
	/** 最大任務天數（僅計算實際有任務的天）；未指定則不限制 */
	maxDays?: number;
}

/** 資料夾模式：來源清單可辨識的四種形態 */
export enum EnumFolderKind
{
	/** 天 + agent-scheduler 任務（`.../2026-09-13/HH-MM-SS_task(...)`） */
	DayTask = 'day-task',
	/** agent-scheduler 任務（父層非天目錄） */
	Task = 'task',
	/** 天目錄（`.../2026-09-13` 或 `.../txt2img-images/2026-11-03`） */
	Day = 'day',
	/** 其他有圖檔的路徑；無法判斷者一律為此 */
	Folder = 'folder',
}

/**
 * 輸入物件：至少要有 `path`
 *
 * 可選欄位：
 *
 * - `kind`：明確表明自身是哪一種資料夾模式（省略則由路徑推斷）
 * - `day` / `task`：幫助構建任務或減少二次查詢（省略則由路徑推斷）
 */
export interface IFolderInputObject
{
	path: string;
	kind?: EnumFolderKind;
	day?: string;
	task?: string;
}

/** 執行端的標準資料夾物件：由 `toTaskFolder` 統一轉換產生 */
export interface ITaskFolder
{
	path: string;
	kind: EnumFolderKind;
	day?: string;
	task?: string;
}

/** 輸入清單的單一元素：路徑字串或至少含 `path` 的物件 */
export type IFolderInputEntry = string | IFolderInputObject;

/**
 * 來源輸入模式：
 *
 * - `globStream(...)`：AsyncIterable（類似 async Generator）
 * - `globAsync(...)`：Promise（陣列）
 * - `Iterable<string>` / `Iterable<object>` / 同步 Generator
 * - 單一字串或單一物件
 * - 構建函式 `() => 以上任一模式`（可逐層展開）
 *
 * 範例：
 *
 * ```ts
 * import { globStream, async as globAsync } from 'fast-glob';
 *
 * autoUploadDemo(undefined, TASK_RANGE, globStream(['**' + '/*_task*'], {
 * 	cwd: 'D:/sd-forge/output/agent-scheduler/2026-09-13',
 * 	onlyFiles: false,
 * 	onlyDirectories: true,
 * 	markDirectories: true,
 * 	deep: 2,
 * 	objectMode: true,
 * 	absolute: true,
 * }));
 * ```
 */
export type IFolderInput =
	| IFolderInputEntry
	| Iterable<IFolderInputEntry>
	| AsyncIterable<IFolderInputEntry>
	| Promise<IFolderInput>
	| (() => IFolderInput);

/**
 * 自動化階段命名：說明與維護時的範圍基準，避免搞錯要修改 / 執行的部分
 *
 * - {@link EnumPostPhase.Upload} ↔ `collectUploadOrder` / `uploadPack` / `waitForUpload` / `reconcileUpload` / `reportBatch`
 * - {@link EnumPostPhase.Publish} ↔ `publishPost` / `ENABLE_PUBLISH`
 * - {@link EnumPostPhase.AutoPost} ↔ `collectTaskDirs` / `resolveFolderInput` / `toTaskFolder` / `expandFolder` / `autoPost`（兩階段串起的完整流程）
 */
export enum EnumPostPhase
{
	/** 上傳階段：將圖片送入等待區並等待計數完成，不涉及任何按鈕點擊 */
	Upload = 'upload',
	/** 發布階段：上傳完成後的 publish 按鈕操作，受 `ENABLE_PUBLISH` 控制，絕不按 save */
	Publish = 'publish',
	/** 完整階段：上傳階段 + 發布階段串起的整個自動發文流程 */
	AutoPost = 'auto-post',
}

/** 檔名類型分類：報表用的單一事實來源 */
export enum EnumUploadKind
{
	/** `xyz_grid-` 開頭的 xyz 交叉網格圖 */
	XyzGrid = 'xyz_grid-',
	/** `grid-` 開頭的一般網格圖 */
	Grid = 'grid-',
	/** 其餘（含 txt2img-images 內的單張圖） */
	Other = '其他',
}

/**
 * 訊息控制選項：以獨立物件傳入（不併入既有參數），相容未來擴充
 */
export interface IMessageOptions
{
	/** 是否輸出過程訊息；預設 `true`，傳 `false` 可隱藏而不移除訊息邏輯 */
	verbose?: boolean;
	/** 批次序號：作為訊息前綴；未提供時不顯示批次 */
	batchNo?: number;
}
