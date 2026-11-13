import type { Page } from 'playwright';
import { _logPhase } from '../util/logger';
import { NOTIFICATION_LOG_RULES, NOTIFICATION_SELECTOR } from '../types/civitai';
import { type IMessageOptions, EnumPostPhase } from '../types/types';
import { LIMIT_RE } from '../types/civitai';
import type { ILogMethod } from '@lazy-playwright/logger';

/**
 * 完整階段：讀取畫面上的系統提示（Mantine Notifications）並記錄
 *
 * 上傳（前/後）與發布（前/後）皆檢查：系統提示通常代表操作失敗
 * （如「今日發布數已達上限」），須於該時機點暴露給操作者。
 * 僅讀取與記錄，不關閉提示；同一提示可能相鄰時機點重複記錄。
 *
 * 記錄 method 依標題 / 內文模式決定（{@link NOTIFICATION_LOG_RULES}，
 * 如「Failed to create post」為 `error`），皆未命中以 `warn`。
 *
 * 提示命中已達上限特徵（{@link LIMIT_RE}）時拋出 {@link LimitReachedError}，
 * 呼叫端應停止任務。
 *
 * @param page 目前頁面
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param phase 檢查所屬階段（輸出前綴）
 * @param moment 檢查時機：`before`（操作前）或 `after`（操作後）
 * @param waitTimeout 先等待任一提示出現的逾時（ms；`0` 代表立即讀取）
 * @throws {LimitReachedError} 提示命中已達上限特徵時拋出
 */
export async function checkNotifications(
	page: Page,
	options: IMessageOptions | undefined,
	phase: EnumPostPhase,
	moment: 'before' | 'after',
	waitTimeout = 0
): Promise<void>
{
	if (waitTimeout > 0)
	{
		/** 提示可能於操作後才出現：先等待任一提示顯示，逾時即直接讀取 */
		await page.waitForSelector(NOTIFICATION_SELECTOR, { state: 'visible', timeout: waitTimeout })
			.catch(() => undefined);
	}

	const notifications = await page.evaluate(selector =>
	{
		return [...document.querySelectorAll(selector)].map(element =>
		{
			return {
				title: element.querySelector('.mantine-Notification-title')?.textContent?.trim() ?? '',
				description: element.querySelector('.mantine-Notification-description')?.textContent?.trim() ?? '',
			};
		});
	}, NOTIFICATION_SELECTOR)
		.catch(() => []);

	if (!notifications.length)
	{
		// _logPhase(phase, options, `notification check (${moment}): none`, 'debug');
		return;
	}

	for (const notification of notifications)
	{
		_logPhase(
			phase,
			options,
			`notification (${moment}): ${notification.title} - ${notification.description}`,
			_notificationMethod(notification)
		);
	}

	/** 命中已達上限特徵：拋出以停止任務 */
	const limit = notifications.find(({ title, description }) => LIMIT_RE.test(`${title} ${description}`));

	if (limit)
	{
		const message = `${limit.title}: ${limit.description}`;

		_logPhase(phase, options, `limit reached, task will stop: ${message}`, 'error');
		throw new LimitReachedError(message);
	}
}

/** 系統提示判定已達上限（如今日發布上限）：拋出以中止後續任務 */
export class LimitReachedError extends Error
{
	constructor(message: string)
	{
		super(message);
		this.name = 'LimitReachedError';
	}
}

/** 依記錄規則決定提示的 log method（{@link NOTIFICATION_LOG_RULES}）；皆未命中以 `warn` */
export function _notificationMethod(notification: { title: string; description: string; }): ILogMethod
{
	const rule = NOTIFICATION_LOG_RULES.find(rule => (rule.title === undefined || rule.title.test(notification.title))
		&& (rule.description === undefined || rule.description.test(notification.description))
	);

	return rule?.method ?? 'warn';
}

