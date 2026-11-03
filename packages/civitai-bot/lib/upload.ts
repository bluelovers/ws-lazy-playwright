import type { Page } from 'playwright';
import { FILE_INPUT_SELECTOR } from './const';
import { _logPhase } from './logger';
import { reportBatch } from './report';
import { EnumPostPhase, type IMessageOptions, type IUploadItem } from './types';
import { debug } from 'node:console';

/** 讀取當前等待區計數文字 `N / 20 files` 的 N；未出現時回傳 0 */
async function _readUploadCount(page: Page): Promise<number>
{
	const text = await page.locator('p').filter({ hasText: /\/\s*20 files/ }).last().textContent().catch(() => null);
	const matched = text?.match(/(\d+)\s*\/\s*20 files/);

	return matched ? Number(matched[1]) : 0;
}

/**
 * 上傳階段：等待上傳計數穩定並回傳本批次實際新增數量
 *
 * 以 `baseline`（本批開始前等待區的既有計數）為基準，需新增 `needed` 張即完成，
 * 避免沿用前一批的計數造成誤判（如 `18/1`）。
 * 未達預期但計數已停止成長（穩定）亦回傳當前值，由呼叫端判斷缺漏。
 * 等待期間每 5 秒報告一次進度，避免無法區分「仍在上傳」與「已卡死」。
 */
export async function waitForUpload(page: Page, baseline: number, needed: number, options?: IMessageOptions): Promise<number>
{
	const deadline = Date.now() + 60_000;
	const stableWindow = 5_000;
	const progressInterval = 5_000;
	const target = baseline + needed;

	let last = baseline;
	let stableSince = Date.now();
	let lastReport = Date.now();

	while (Date.now() < deadline)
	{
		const current = await _readUploadCount(page);

		if (current !== last)
		{
			last = current;
			stableSince = Date.now();
		}

		if (last >= target) return last - baseline;

		/** 每 5 秒報告一次進度：區分「仍在上傳」與「已崩潰/卡死」 */
		if (Date.now() - lastReport >= progressInterval)
		{
			_logPhase(
				EnumPostPhase.Upload,
				options,
				`waiting: ${last - baseline}/${needed} files, ${Math.round((deadline - Date.now()) / 1000)}s left`,
				'debug',
			);
			lastReport = Date.now();
		}

		/** 計數已出現且停止成長：視為上傳結束（缺漏由呼叫端處理） */
		if (last > baseline && Date.now() - stableSince >= stableWindow) return last - baseline;

		await page.waitForTimeout(2000);
	}

	_logPhase(EnumPostPhase.Upload, options, `wait deadline reached: ${last - baseline}/${needed} files`, 'debug');
	return last - baseline;
}

/**
 * 上傳階段：設定檔案並等待計數；回傳累計至目前為止的批次實際數量
 *
 * 先讀取設定前的基準計數，完成後以「本批預期總數 - 未上傳數」回推，
 * 設定數量與完成數量的訊息由此輸出（自動反映實際值），
 * 單獨上傳與切包上傳共用此函式，訊息自然一致。
 */
export async function uploadPack(
	page: Page,
	files: readonly string[],
	expectedTotal: number,
	options?: IMessageOptions,
): Promise<number>
{
	const baseline = await _readUploadCount(page);

	_logPhase(EnumPostPhase.Upload, options, `files set: ${files.length} (total ${expectedTotal})`, 'debug');

	await page.locator(FILE_INPUT_SELECTOR).setInputFiles([...files]);

	const uploaded = await waitForUpload(page, baseline, files.length, options);
	const actual = expectedTotal - (files.length - uploaded);

	_logPhase(EnumPostPhase.Upload, options, `upload complete: ${actual}/${expectedTotal}`, 'debug');

	return actual;
}

/**
 * 上傳階段：數量不符時，假設缺少者為已設定檔案中的最後 N 張
 *
 * 回傳應排入下一次完整階段（AutoPost）的檔案路徑。
 */
export function takeMissing(setPaths: readonly string[], actual: number): string[]
{
	return actual >= setPaths.length ? [] : setPaths.slice(actual);
}

/**
 * 上傳階段：比對預期與實際數量，輸出結果並回傳應排回佇列的項目
 *
 * 數量符合預期以 success 記錄；缺漏者（假設為最後幾張）連同未上傳者
 * 排入下一次完整階段，本次以實際數量進入發布階段。
 */
export function reconcileUpload(
	batchNo: number,
	options: IMessageOptions | undefined,
	task: readonly IUploadItem[],
	setPaths: readonly string[],
	actual: number,
): IUploadItem[]
{
	const message: IMessageOptions = { ...options, batchNo };
	const missing = takeMissing(setPaths, actual);

	if (missing.length)
	{
		_logPhase(
			EnumPostPhase.Upload,
			message,
			`expected ${setPaths.length}, actual ${actual}, missing ${missing.length} -> next ${EnumPostPhase.AutoPost}`,
		);

		reportBatch(batchNo, task.slice(0, actual).map(item => item.path), `missing ${missing.length}`, options);

		/** 缺漏者假設為最後幾張：以項目本身排回佇列，保留大小資訊供 5MB 切包 */
		return task.slice(actual);
	}

	_logPhase(EnumPostPhase.Upload, message, `upload complete, ${actual} files (as expected)`, 'success');
	reportBatch(batchNo, task.map(item => item.path), 'uploaded', options);

	return [];
}
