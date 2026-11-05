import { createInterface } from 'node:readline/promises';
import type { BrowserContext, Page } from 'playwright';
import {
	CREATE_URL,
	DROPZONE_SELECTOR,
	DROPZONE_WAIT_TIMEOUT,
	ENABLE_PUBLISH,
	LIMIT_RE,
	NOTIFICATION_LOG_RULES,
	NOTIFICATION_SELECTOR,
	PUBLISHED_URL_PATTERNS,
	PUBLISH_SELECTOR,
	PUBLISH_URL_TIMEOUT,
} from './const';
import { _logPhase, type ILogMethod } from './logger';
import { EnumPostPhase, EnumPublishResult, type IMessageOptions } from './types';

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
 *
 * @param url 建立貼文頁（上傳頁面）網址；未指定時沿用 {@link CREATE_URL}
 */
export async function createPostPage(context: BrowserContext, url: string = CREATE_URL): Promise<Page>
{
	const page = await context.newPage();
	await page.goto(url);
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
 * 判斷網址是否為發布後落地頁；命中清單首位以外的不同模式時以 warn 提醒
 */
function _isPublishedLanding(url: string, options?: IMessageOptions): boolean
{
	const index = PUBLISHED_URL_PATTERNS.findIndex(({ pattern }) => pattern.test(url));

	if (index < 0)
	{
		return false;
	}

	/** 落地頁與預期模式（清單首位）不同：提醒操作者，仍視為發布完成 */
	if (index > 0)
	{
		_logPhase(
			EnumPostPhase.Publish,
			options,
			`landing differs from expected pattern "${PUBLISHED_URL_PATTERNS[index].name}": ${url}`,
			'warn',
		);
	}

	return true;
}

/** publish 按鈕三狀態快照（屬性值；`null` 代表屬性不存在） */
interface IPublishButtonState
{
	/** `[data-loading]` 屬性值：讀取中 */
	dataLoading: string | null;
	/** `[data-disabled]` 屬性值：其他停用原因（`"true"` 代表未就緒） */
	dataDisabled: string | null;
	/** `disabled` 屬性值：原生停用（存在即未就緒） */
	disabled: string | null;
}

/** 就緒穩定期（ms）：狀態就緒後須維持該時長；期間任一狀態變化即重新起算 3 秒 */
const READY_STABLE_MS = 3000;

/** 狀態複查間隔（ms）：穩定期內每秒複查三狀態 */
const READY_POLL_MS = 1000;

/** 讀取 publish 按鈕三狀態快照；按鈕未渲染時回傳 `null` */
async function _readPublishState(page: Page): Promise<IPublishButtonState | null>
{
	return page.evaluate(selector =>
	{
		const el = document.querySelector(selector);

		if (!el) return null;

		return {
			dataLoading: el.getAttribute('data-loading'),
			dataDisabled: el.getAttribute('data-disabled'),
			disabled: el.getAttribute('disabled'),
		};
	}, PUBLISH_SELECTOR);
}

/** 兩次快照是否代表相同狀態（三屬性值皆相同；皆未渲染視為相同） */
function _isSameState(a: IPublishButtonState | null, b: IPublishButtonState | null): boolean
{
	if (a === null || b === null)
	{
		return a === b;
	}

	return a.dataLoading === b.dataLoading
		&& a.dataDisabled === b.dataDisabled
		&& a.disabled === b.disabled;
}

/**
 * 發布階段：等待 publish 按鈕真正就緒（載入 / 停用狀態消失且維持穩定）
 *
 * 按鈕可見不代表可點擊：
 *
 * - `[data-loading]`：仍在讀取中
 * - `[data-disabled="true"]` / `[disabled]`：尚有其他原因，發布未準備好
 *
 * 就緒後須維持 {@link READY_STABLE_MS}（3 秒）才算真正就緒：
 * 穩定期內每 {@link READY_POLL_MS}（1 秒）複查一次，三狀態（`data-loading` / `data-disabled` / `disabled`）
 * 任一產生變化（含按鈕重渲染消失）即重新起算 3 秒；期間任一刻未就緒也重新起算。
 *
 * 兩次快照皆就緒且無變化地度過整個穩定期才回傳 `true`；
 * 總逾時仍未達成回傳 `false` 並記錄，呼叫端不得點擊。
 *
 * @param page 已載入建立貼文頁的頁面
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param timeout 等待逾時（ms，含穩定期）
 */
async function _waitPublishReady(
	page: Page,
	options?: IMessageOptions,
	timeout = 30_000,
): Promise<boolean>
{
	const deadline = Date.now() + timeout;

	/** 前次快照：`undefined` 代表尚未讀取過 */
	let previous: IPublishButtonState | null | undefined;

	/** 穩定期起算點：`undefined` 代表當前未處於穩定期 */
	let stableSince: number | undefined;

	let printNotReady = true;

	for (;;)
	{
		const state = await _readPublishState(page);

		/** 就緒判定：非載入中，且 `data-disabled` 非 `"true"`、`disabled` 不存在 */
		const ready = state !== null
			&& state.dataLoading === null
			&& state.dataDisabled !== 'true'
			&& state.disabled === null;

		/** 三狀態任一變化：重新起算穩定期（允許再多一次 3 秒） */
		const changed = previous !== undefined && !_isSameState(previous, state);

		previous = state;

		if (changed)
		{
			_logPhase(
				EnumPostPhase.Publish,
				options,
				`publish button state changed: ${JSON.stringify(state)}`,
				'debug',
			);
		}

		if (!ready)
		{
			stableSince = undefined;

			if (printNotReady)
			{
				_logPhase(EnumPostPhase.Publish, options, `waiting: publish button not ready: ${JSON.stringify(state)}`, 'warn');
				printNotReady = false;
			}
		}
		else if (stableSince === undefined || changed)
		{
			stableSince = Date.now();

			if (!changed)
			{
				_logPhase(EnumPostPhase.Publish, options, 'publish button visible, waiting for stable period', 'debug');
			}
		}
		else if (Date.now() - stableSince >= READY_STABLE_MS)
		{
			return true;
		}

		if (Date.now() + READY_POLL_MS > deadline)
		{
			_logPhase(
				EnumPostPhase.Publish,
				options,
				`publish button not ready within ${timeout / 1000}s (loading/disabled persists): ${PUBLISH_SELECTOR}: ${JSON.stringify(state)}`,
				'error',
			);
			return false;
		}

		await page.waitForTimeout(READY_POLL_MS);
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
function _notificationMethod(notification: { title: string; description: string }): ILogMethod
{
	const rule = NOTIFICATION_LOG_RULES.find(rule =>
		(rule.title === undefined || rule.title.test(notification.title))
		&& (rule.description === undefined || rule.description.test(notification.description)),
	);

	return rule?.method ?? 'warn';
}

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
	waitTimeout = 0,
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
			_notificationMethod(notification),
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

/**
 * 發布階段：點擊 publish 按鈕並等待跳轉為已發布落地頁（僅在發布開關為 `true` 時執行）
 *
 * 安全規則：絕不點擊 save（草稿）按鈕；publish 僅在開關開啟時點擊，
 * 且只會在上傳階段的 waiter 結束後被呼叫。
 *
 * 點擊前須按鈕真正就緒（{@link _waitPublishReady}）：讀取中（`[data-loading]`）
 * 或停用（`[data-disabled="true"]` / `[disabled]`）狀態消失，且穩定維持 3 秒
 * （期間任一狀態變化即重新計時）才點擊；
 * 逾時仍未就緒回傳 `unconfirmed`（未點擊），呼叫端不得標記完成。
 * 點擊前後檢查系統提示（{@link checkNotifications}）：如「今日發布數已達上限」
 * 等失敗訊息於點擊後與按鈕消失競速讀取，即時以 warn 記錄。
 *
 * 預設開關為 {@link ENABLE_PUBLISH}，可由呼叫端以 `enablePublish` 覆寫（CLI `--publish`）。
 *
 * 發布完成以落地頁特徵 {@link PUBLISHED_URL_PATTERNS} 判定（貼文頁、模型頁等）：
 * 僅等待網址更新（`waitUntil: 'commit'`），不等待頁面載入完成；逾時未跳轉回傳 `unconfirmed`。
 * 完成紀錄含發布後的網址（未取得跳轉時無網址）。
 *
 * @param enablePublish 是否執行發布；未提供時沿用 {@link ENABLE_PUBLISH}
 * @returns {@link EnumPublishResult}：`published` 確認落地、`disabled` 未執行發布、`unconfirmed` 未點擊或已點擊但未確認落地
 */
export async function publishPost(
	page: Page,
	options?: IMessageOptions,
	enablePublish = ENABLE_PUBLISH,
): Promise<EnumPublishResult>
{
	if (!enablePublish)
	{
		_logPhase(EnumPostPhase.Publish, options, 'skipped: publish disabled');
		return EnumPublishResult.Disabled;
	}

	const publishBtn = page.locator(PUBLISH_SELECTOR);

	/** 發布按鈕在上載完成後才渲染；以等待取代猜測點擊目標 */
	await publishBtn.waitFor({ state: 'visible', timeout: 30_000 });

	await page.waitForTimeout(2000);

	/** 按鈕可見不代表可點：讀取中或停用狀態消失前絕不點擊 */
	if (!await _waitPublishReady(page, options))
	{
		return EnumPublishResult.Unconfirmed;
	}

	await page.waitForTimeout(1000);

	/** 點擊前：檢查系統提示（如先前操作遺留的失敗訊息） */
	await checkNotifications(page, options, EnumPostPhase.Publish, 'before');

	_logPhase(EnumPostPhase.Publish, options, `clicking: ${PUBLISH_SELECTOR}`);
	await publishBtn.click();

	/** 按鈕消失（跳轉啟動）等待：與點擊後的提示檢查競速共用 */
	const hidden = publishBtn.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);

	/**
	 * 點擊後：競速等待系統提示出現（如發布失敗、今日上限提示）與按鈕消失，
	 * 先到者結束並即時記錄提示；結束後仍須等按鈕消失才進入落地檢查
	 */
	await Promise.race([
		checkNotifications(page, options, EnumPostPhase.Publish, 'after', 30_000),
		hidden,
	]);

	await hidden;
	_logPhase(EnumPostPhase.Publish, options, 'clicked');

	/** 網址已到達發布後落地頁（導向已提交）即視為發布完成，無需再等待 */
	if (_isPublishedLanding(page.url(), options))
	{
		return EnumPublishResult.Published;
	}

	const published = await page.waitForURL(
		url => _isPublishedLanding(url.href, options),
		{ waitUntil: 'commit', timeout: PUBLISH_URL_TIMEOUT },
	)
		.then(() => true)
		.catch(() => false);

	_logPhase(
		EnumPostPhase.Publish,
		options,
		published ? `published: ${page.url()}` : `publish url not observed within ${PUBLISH_URL_TIMEOUT / 1000}s`,
		published ? 'success' : 'log',
	);

	return published ? EnumPublishResult.Published : EnumPublishResult.Unconfirmed;
}
