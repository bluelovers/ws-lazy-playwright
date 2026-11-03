import { createInterface } from 'node:readline/promises';
import type { BrowserContext, Page } from 'playwright';
import {
	CREATE_URL,
	DROPZONE_SELECTOR,
	DROPZONE_WAIT_TIMEOUT,
	ENABLE_PUBLISH,
	POST_URL_RE,
	PUBLISH_SELECTOR,
	PUBLISH_URL_TIMEOUT,
} from './const';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions } from './types';

/** 以標準輸入讀取一行（去空白、小寫）；用於 y/n 確認 */
async function _ask(question: string): Promise<string>
{
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	try
	{
		return (await rl.question(question)).trim().toLowerCase();
	}
	finally
	{
		rl.close();
	}
}

/**
 * 完整階段：開啟建立貼文頁（`newPage` + `goto`）
 *
 * 初始頁面與發布完成後的下一批次，皆由此取得新的建立貼文頁。
 */
export async function createPostPage(context: BrowserContext): Promise<Page>
{
	const page = await context.newPage();
	await page.goto(CREATE_URL);
	return page;
}

/**
 * 完整階段：確認上傳區存在（頁面載入與登入狀態檢查）
 *
 * 等待逾時代表頁面載入失敗或登入失敗：提示使用者手動處理後
 * 以 y/n 決定重新檢查或中止；中止時回傳 `false`，呼叫端不得執行後續任務。
 */
export async function ensureDropzone(page: Page, options?: IMessageOptions): Promise<boolean>
{
	for (;;)
	{
		const visible = await page.locator(DROPZONE_SELECTOR)
			.waitFor({ state: 'visible', timeout: DROPZONE_WAIT_TIMEOUT })
			.then(() => true)
			.catch(() => false);

		if (visible)
		{
			_logPhase(EnumPostPhase.Upload, options, `dropzone ready: ${DROPZONE_SELECTOR}`);
			return true;
		}

		_logPhase(
			EnumPostPhase.AutoPost,
			options,
			`dropzone not found within ${DROPZONE_WAIT_TIMEOUT / 1000}s: page load failed or login failed`,
		);

		const answer = await _ask('Log in manually, then type y to retry / n to abort: ');

		if (answer !== 'y')
		{
			_logPhase(EnumPostPhase.AutoPost, options, 'aborted by user: subsequent tasks will not run');
			return false;
		}
	}
}

/**
 * 發布階段：點擊 publish 按鈕並等待跳轉為已發布貼文（僅在發布開關為 `true` 時執行）
 *
 * 安全規則：絕不點擊 save（草稿）按鈕；publish 僅在開關開啟時點擊，
 * 且只會在上傳階段的 waiter 結束後被呼叫。
 *
 * 預設開關為 {@link ENABLE_PUBLISH}，可由呼叫端以 `enablePublish` 覆寫（CLI `--publish`）。
 *
 * 發布完成以網址特徵 {@link POST_URL_RE} 判定：僅等待網址更新（`waitUntil: 'commit'`），
 * 不等待頁面載入完成；逾時未跳轉時回傳 `false`。
 * 完成紀錄含發布後的網址（未取得跳轉時無網址）。
 *
 * @param enablePublish 是否執行發布；未提供時沿用 {@link ENABLE_PUBLISH}
 * @returns 是否完成發布；未啟用發布或未觀察到跳轉時回傳 `false`
 */
export async function publishPost(
	page: Page,
	options?: IMessageOptions,
	enablePublish = ENABLE_PUBLISH,
): Promise<boolean>
{
	if (!enablePublish)
	{
		_logPhase(EnumPostPhase.Publish, options, 'skipped: publish disabled (never clicking save)');
		return false;
	}

	const publish = page.locator(PUBLISH_SELECTOR);

	/** 發布按鈕在上載完成後才渲染；以等待取代猜測點擊目標 */
	await publish.waitFor({ state: 'visible', timeout: 30_000 });

	_logPhase(EnumPostPhase.Publish, options, `clicking: ${PUBLISH_SELECTOR}`);
	await publish.click();

	await publish.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
	_logPhase(EnumPostPhase.Publish, options, 'clicked');

	/** 網址已跳轉（導向已提交）即視為發布完成，無需再等待 */
	if (POST_URL_RE.test(page.url()))
	{
		return true;
	}

	const published = await page.waitForURL(POST_URL_RE, { waitUntil: 'commit', timeout: PUBLISH_URL_TIMEOUT })
		.then(() => true)
		.catch(() => false);

	_logPhase(
		EnumPostPhase.Publish,
		options,
		published ? `published: ${page.url()}` : `publish url not observed within ${PUBLISH_URL_TIMEOUT / 1000}s`,
		published ? 'success' : 'log',
	);

	return published;
}
