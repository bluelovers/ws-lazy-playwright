import { LIMIT_RE } from '../util/re';
import { INotificationLogRule, IPublishedUrlPattern } from './const';

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

