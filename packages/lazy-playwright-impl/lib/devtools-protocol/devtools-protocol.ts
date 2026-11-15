import { CDPSession, Frame, Page } from 'playwright';
import { EnumAutomationEngine, IHandleBrowserKindResult } from '@lazy-playwright/shared-types';
import { _tryDetachCDPSession } from './util';

/**
 * 建構選項：提供瀏覽器種類 (Browser Kind)，
 * 用於限制 DevTools Protocol 僅能在 Chromium 使用
 */
export interface IPageDevtoolsProtocolOptions extends Pick<IHandleBrowserKindResult, 'browserKind'>
{

}

/** CDP Session 的建立目標：整頁或單一框架 */
export type IPageOrFrame = Page | Frame;

/**
 * 對應 CDPSession.send 的三個參數位次：[0] 命令名稱 (Method)、
 * [1] 命令參數 (Params)、[2] 請求選項 (Options)
 */
export type IProtocolCommandParameters = Parameters<CDPSession['send']>[0];
export type IProtocolCommandParametersParams = Parameters<CDPSession['send']>[1];
export type IProtocolCommandParametersOptions = Parameters<CDPSession['send']>[2];

/**
 * DevTools Protocol 存取的抽象基類 (Abstract Class)：以頁面或框架為目標持有 CDP Session，
 * 並在建構期驗證環境（僅 Chromium 支援 DevTools Protocol）
 */
export abstract class PageDevtoolsProtocol
{
	/** 頁面層級的 CDP Session，首次取得時建立並快取 */
	protected _pageSession: CDPSession;
	/** 各框架 (Frame) 的 CDP Session 快取；以 WeakMap 保存以免延長框架的生命週期 */
	protected _frameSessionMap: WeakMap<Frame, CDPSession>;
	/** 此實例所屬的頁面 */
	protected _page: Page;
	/** 建構時傳入的框架；以整頁建立時保持 undefined */
	protected _frame: Frame;

	/**
	 * 以頁面或框架為目標建立 DevTools Protocol 存取實例
	 *
	 * @param pageOrFrame - CDP Session 的掛載目標：整頁或單一框架
	 * @param options - 建構選項，提供驗證所需的瀏覽器種類 (Browser Kind)
	 */
	constructor(pageOrFrame: IPageOrFrame, protected _options: IPageDevtoolsProtocolOptions)
	{
		this._initialize(pageOrFrame);
	}

	/**
	 * 解析建構目標並完成前置驗證
	 *
	 * @param pageOrFrame - 整頁或單一框架
	 */
	protected _initialize(pageOrFrame: IPageOrFrame)
	{
		let page = pageOrFrame as Page;
		const frame = pageOrFrame as Frame;

		/**
		 * 以鴨子型別 (Duck Typing) 區分聯合型別中的 Frame 與 Page：
		 * 僅 Frame 具備 page() 方法，命中時以其所屬頁面作為此實例的頁面
		 */
		if (typeof frame.page === 'function')
		{
			page = frame.page();
			this._frame = frame;
		}

		/**
		 * 記錄目標頁面後立即驗證瀏覽器種類與頁面狀態，
		 * 使不支援的環境或已關閉的頁面在第一次操作前即失敗 (Fail Fast)
		 */
		this._page = page;

		this._validateBrowserKind();
		this._validatePage();
	}

	/** 所屬頁面；以框架 (Frame) 建立時為該框架的所屬頁面 */
	get page()
	{
		return this._page;
	}

	/** 建構目標為框架時的框架實例；以整頁建立時為 undefined */
	get frame()
	{
		return this._frame;
	}

	/** 回傳建構時的目標：以框架建立時回傳框架，否則回傳頁面 */
	getFrameOrPage()
	{
		return this._frame ?? this._page;
	}

	get browserKind()
	{
		return this._options.browserKind;
	}

	/**
	 * 驗證目標瀏覽器為 Chromium
	 *
	 * @throws TypeError 非 Chromium 時擲出，DevTools Protocol 僅 Chromium 支援
	 */
	protected _validateBrowserKind()
	{
		if (this.browserKind !== EnumAutomationEngine.Chromium)
		{
			throw new TypeError(`Browser kind is not supported for DevTools Protocol: ${this.browserKind}`);
		}
	}

	/**
	 * 驗證頁面存在且未關閉 (Not Closed)
	 *
	 * @throws TypeError 頁面不存在或已關閉時擲出
	 */
	protected _validatePage()
	{
		if (!this.page || this.page.isClosed())
		{
			throw new TypeError(`Page is not set or closed: ${this.page}`);
		}
	}

	/** 取得頁面層級的 CDP Session：首次呼叫時建立並快取，之後回傳同一實例 */
	async getPageSession(notCreate?: boolean)
	{
		if (!this._pageSession && !notCreate)
		{
			this._pageSession = await this._newClientSession(this._page);
		}
		return this._pageSession;
	}

	/**
	 * 取得指定框架 (Frame) 的 CDP Session：不存在時建立並快取
	 *
	 * @param frame - 目標框架，必須屬於此實例的頁面
	 * @throws RangeError 框架不屬於此頁面時擲出
	 */
	async getFrameSession(frame: Frame, notCreate?: boolean)
	{
		/** 框架所屬頁面不符時拒絕，避免將其他頁面的 session 誤用於此實例 */
		if (frame.page() !== this._page)
		{
			throw new RangeError(`Frame does not belong to this page: ${frame}`);
		}

		/** 快取表延後至確實需要框架 session 時才建立 */
		this._frameSessionMap ??= new WeakMap();

		let frameSession: CDPSession;

		/** 快取未命中時才建立新 session，同一框架的重複呼叫共用同一實例 */
		if (!this._frameSessionMap.has(frame) && !notCreate)
		{
			frameSession = await this._newClientSession(frame);
			this._frameSessionMap.set(frame, frameSession);
		}

		/** 新建立者直接回傳，其餘情形自快取取得 */
		return frameSession ?? this._frameSessionMap.get(frame);
	}

	async detachPageSession()
	{
		await _tryDetachCDPSession(this._pageSession);
		this._pageSession = undefined;
	}

	async detachFrameSession(frame: Frame)
	{
		const session = await this.getFrameSession(frame, true);
		if (session)
		{
			await _tryDetachCDPSession(session);
		}

		this._frameSessionMap?.delete(frame);
	}

	/** Detach CDP Session */
	async detach()
	{
		await this.detachPageSession();
	}

	/** 取得頁面所屬的瀏覽器上下文 (Browser Context)，新的 CDP Session 皆由此建立 */
	context()
	{
		return this.page.context();
	}

	/**
	 * 建立新的 CDP Session；快取由 getPageSession／getFrameSession 負責
	 *
	 * @param pageOrFrame - 掛載目標：整頁或單一框架
	 */
	protected async _newClientSession(pageOrFrame: IPageOrFrame)
	{
		return this.context().newCDPSession(pageOrFrame);
	}

}

/** 本實作對外承諾的 CDPSession 介面子集 */
type ICDPSessionImplements = Pick<CDPSession, 'send' | 'on' | 'once' | 'addListener' | 'removeListener' | 'off' | 'prependListener'>;
/** 上述介面子集的方法名稱，供 _internalSessionMethod 的方法參數收斂使用 */
type ICDPSessionImplementsMethods = keyof ICDPSessionImplements;

/**
 * Chromium 專用實作：以頁面層級 CDP Session 為後端，
 * 對外提供與 CDPSession 一致的命令傳送與事件監聽介面
 */
export class PageDevtoolsProtocolChromium extends PageDevtoolsProtocol implements ICDPSessionImplements
{
	/**
	 * 取得頁面 CDP Session 並依方法名稱 (Method) 轉發呼叫
	 *
	 * @param method - 要轉發的方法；排除 'send'，因其由專屬實作直接處理
	 * @internal
	 */
	protected async _internalSessionMethod<T extends Exclude<ICDPSessionImplementsMethods, 'send'>>(method: T, args: any[])
	{
		const session = await this.getPageSession();
		/** 依方法名稱動態轉發，字串索引呼叫無法通過型別檢查 (Type Check)，故以 @ts-ignore 標記 */
		// @ts-ignore
		return session[method](...args) as CDPSession;
	}

	/** 以頁面 CDP Session 發送協定命令 (Protocol Command)，簽章與 CDPSession.send 一致 */
	send: CDPSession['send'] = async (...args) =>
	{
		const session = await this.getPageSession();
		return session.send(...args);
	}

	/** 於頁面 CDP Session 註冊事件監聽 (Event Listener) */
	// @ts-ignore
	on: CDPSession['on'] = async (...args) =>
	{
		return this._internalSessionMethod('on', args);
	}

	/** 於頁面 CDP Session 註冊僅觸發一次的監聽 (One-time Listener) */
	// @ts-ignore
	once: CDPSession['once'] = async (...args) =>
	{
		return this._internalSessionMethod('once', args);
	}

	/** 於頁面 CDP Session 新增事件監聽 (Add Listener) */
	// @ts-ignore
	addListener: CDPSession['addListener'] = async (...args) =>
	{
		return this._internalSessionMethod('addListener', args);
	}

	/** 於頁面 CDP Session 移除事件監聽 (Remove Listener) */
	// @ts-ignore
	removeListener: CDPSession['removeListener'] = async (...args) =>
	{
		return this._internalSessionMethod('removeListener', args);
	}

	/** 於頁面 CDP Session 解除事件監聽 (Off) */
	// @ts-ignore
	off: CDPSession['off'] = async (...args) =>
	{
		return this._internalSessionMethod('off', args);
	}

	/** 於頁面 CDP Session 新增前置事件監聽 (Prepend Listener) */
	// @ts-ignore
	prependListener: CDPSession['prependListener'] = async (...args) =>
	{
		return this._internalSessionMethod('prependListener', args);
	}

}
