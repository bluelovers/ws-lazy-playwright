/** 單一待上傳檔案：路徑、大小（供 5MB 總和切包）與時間戳（供新增檔案比對） */
export interface IUploadItem
{
	path: string;
	size: number;
	/** 檔案時間戳（mtimeMs）：完成邊界比對新增檔案用 */
	mtime: number;
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
 * 由 {@link iterateFolderInput} 逐項解析為 {@link IFolderStream}。
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
	/** globStream */
	| NodeJS.ReadableStream
	| Promise<IFolderInput>
	| (() => IFolderInput);

/**
 * 資料夾串流 (Folder Stream)：來源解析後的標準資料夾輸出形態
 *
 * 同步 / 非同步可迭代（Iterable / AsyncIterable）皆可，由生成器 (Generator) 延遲產出 (Lazy Yield)，
 * 呼叫端以 `for await` 逐項消費；大量目錄時不建立中間陣列 (Intermediate Array)。
 */
export type IFolderStream = Iterable<ITaskFolder> | AsyncIterable<ITaskFolder>;

/**
 * 自動化階段命名：說明與維護時的範圍基準，避免搞錯要修改 / 執行的部分
 *
 * - {@link EnumPostPhase.Upload} ↔ `collectUploadOrder` / `uploadPack` / `waitForUpload` / `reconcileUpload` / `reportBatch`
 * - {@link EnumPostPhase.Publish} ↔ `publishPost` / `ENABLE_PUBLISH`
 * - {@link EnumPostPhase.AutoPost} ↔ `iterateTaskDirs` / `iterateFolderInput` / `toTaskFolder` / `expandFolder` / `collectFolders` / `loadTaskProgress` / `createCompletionRecord` / `autoPost`（兩階段串起的完整流程）
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

/**
 * 發布結果：`publishPost` 的回傳值
 *
 * 供呼叫端區分「未執行發布」與「已點擊但未確認落地」，進度據此決定是否推進。
 */
export enum EnumPublishResult
{
	/** 發布停用（未點擊）：該批次不算發布完成 */
	Disabled = 'disabled',
	/** 已點擊但未觀察到落地頁網址：發布狀態未確認 */
	Unconfirmed = 'unconfirmed',
	/** 已確認發布：網址到達落地頁特徵 */
	Published = 'published',
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

/**
 * 執行設定：由呼叫端於執行前覆寫預設值（CLI 參數用）
 *
 * 未指定的欄位維持預設行為：發布停用（`ENABLE_PUBLISH = false`）、
 * 第 {@link DRY_RUN_FROM_BATCH} 批起 dry run、建立貼文頁網址 `CREATE_URL`。
 */
export interface IRunSwitches
{
	/** 是否執行發布；解除 `ENABLE_PUBLISH` 預設停用（絕不按 save 的安全規則不變） */
	enablePublish?: boolean;
	/** 是否停用 dry run；解除後每批實際上傳並進入發布階段 */
	disableDryRun?: boolean;
	/** 建立貼文頁（上傳頁面）網址；未指定時沿用 `CREATE_URL` */
	createUrl?: string;
	/** agent-scheduler 任務的發布次數上限：達上限即忽略剩餘圖片（僅任務模式生效，CLI `--ags-max-publish`，預設不限制） */
	agsMaxPublish?: number;
}
