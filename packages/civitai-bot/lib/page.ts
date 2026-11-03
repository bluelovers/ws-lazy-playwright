import { createInterface } from 'node:readline/promises';
import type { Page } from 'playwright';
import { DROPZONE_SELECTOR, DROPZONE_WAIT_TIMEOUT, ENABLE_PUBLISH, PUBLISH_SELECTOR } from './const';
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
 * 發布階段：點擊 publish 按鈕（僅在 {@link ENABLE_PUBLISH} 為 `true` 時執行）
 *
 * 安全規則：絕不點擊 save（草稿）按鈕；publish 僅在開關開啟時點擊，
 * 且只會在上傳階段的 waiter 結束後被呼叫。
 */
export async function publishPost(page: Page, options?: IMessageOptions): Promise<void>
{
	if (!ENABLE_PUBLISH)
	{
		_logPhase(EnumPostPhase.Publish, options, 'skipped: ENABLE_PUBLISH = false (never clicking save)');
		return;
	}

	const publish = page.locator(PUBLISH_SELECTOR);

	/** 發布按鈕在上載完成後才渲染；以等待取代猜測點擊目標 */
	await publish.waitFor({ state: 'visible', timeout: 30_000 });

	_logPhase(EnumPostPhase.Publish, options, `clicking: ${PUBLISH_SELECTOR}`);
	await publish.click();

	await publish.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
	_logPhase(EnumPostPhase.Publish, options, 'clicked');
}
