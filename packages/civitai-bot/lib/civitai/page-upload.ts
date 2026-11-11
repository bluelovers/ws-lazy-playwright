import type { Page } from 'playwright';
import { _logPhase } from '../logger';
import { type IMessageOptions, EnumPostPhase } from '../types/types';
import { FILE_INPUT_SELECTOR } from '../types/civitai';
import { checkNotifications } from './page';


/** 讀取當前等待區計數文字 `N / 20 files` 的 N；未出現時回傳 0 */
export async function _readUploadCount(page: Page): Promise<number>
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
	const deadline = Date.now() + 60000;
	const stableWindow = 5000;
	const progressInterval = 5000;
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
				'debug'
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
 *
 * 設定檔案前後皆檢查系統提示（{@link checkNotifications}）：
 * 如檔案被拒、數量上限等失敗訊息即時以 warn 記錄。
 */
export async function uploadPack(
	page: Page,
	files: readonly string[],
	expectedTotal: number,
	options?: IMessageOptions
): Promise<number>
{
	const baseline = await _readUploadCount(page);

	/** 上傳前：檢查系統提示（如先前操作遺留的失敗訊息） */
	await checkNotifications(page, options, EnumPostPhase.Upload, 'before');

	_logPhase(EnumPostPhase.Upload, options, `files set: ${files.length} (total ${expectedTotal})`, 'debug');

	await page.locator(FILE_INPUT_SELECTOR).setInputFiles([...files]);

	const uploaded = await waitForUpload(page, baseline, files.length, options);
	const actual = expectedTotal - (files.length - uploaded);

	/** 上傳後：檢查系統提示（如檔案被拒、上傳失敗訊息） */
	await checkNotifications(page, options, EnumPostPhase.Upload, 'after');

	_logPhase(EnumPostPhase.Upload, options, `upload complete: ${actual}/${expectedTotal}`, 'debug');

	return actual;
}

