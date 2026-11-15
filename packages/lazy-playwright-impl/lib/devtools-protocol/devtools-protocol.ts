import { CDPSession, Frame, Page } from 'playwright';
import { EnumAutomationEngine, IHandleBrowserKindResult } from '@lazy-playwright/shared-types';

export interface IPageDevtoolsProtocolOptions extends Pick<IHandleBrowserKindResult, 'browserKind'>
{

}

export type IPageOrFrame = Page | Frame;

export type IProtocolCommandParameters = Parameters<CDPSession['send']>[0];
export type IProtocolCommandParametersParams = Parameters<CDPSession['send']>[1];
export type IProtocolCommandParametersOptions = Parameters<CDPSession['send']>[2];

export abstract class PageDevtoolsProtocol
{
	protected _pageSession: CDPSession;
	protected _frameSessionMap: WeakMap<Frame, CDPSession>;
	protected _page: Page;
	protected _frame: Frame;

	constructor(pageOrFrame: IPageOrFrame, protected _options: IPageDevtoolsProtocolOptions)
	{
		this._initialize(pageOrFrame);
	}

	protected _initialize(pageOrFrame: IPageOrFrame)
	{
		let page = pageOrFrame as Page;
		const frame = pageOrFrame as Frame;

		if (typeof frame.page === 'function')
		{
			page = frame.page();
			this._frame = frame;
		}

		this._page = page;

		this._validateBrowserKind();
		this._validatePage();
	}

	get page()
	{
		return this._page;
	}

	get frame()
	{
		return this._frame;
	}

	getFrameOrPage()
	{
		return this._frame ?? this._page;
	}

	get browserKind()
	{
		return this._options.browserKind;
	}

	protected _validateBrowserKind()
	{
		if (this.browserKind !== EnumAutomationEngine.Chromium)
		{
			throw new TypeError(`Browser kind is not supported for DevTools Protocol: ${this.browserKind}`);
		}
	}

	protected _validatePage()
	{
		if (!this.page || this.page.isClosed())
		{
			throw new TypeError(`Page is not set or closed: ${this.page}`);
		}
	}

	async getPageSession()
	{
		if (!this._pageSession)
		{
			this._pageSession = await this._newClientSession(this._page);
		}
		return this._pageSession;
	}

	async getFrameSession(frame: Frame)
	{
		if (frame.page() !== this._page)
		{
			throw new RangeError(`Frame does not belong to this page: ${frame}`);
		}

		this._frameSessionMap ??= new WeakMap();

		let frameSession: CDPSession;

		if (!this._frameSessionMap.has(frame))
		{
			frameSession = await this._newClientSession(frame);
			this._frameSessionMap.set(frame, frameSession);
		}

		return frameSession ?? this._frameSessionMap.get(frame);
	}

	context()
	{
		return this.page.context();
	}

	protected async _newClientSession(pageOrFrame: IPageOrFrame)
	{
		return this.context().newCDPSession(pageOrFrame);
	}

}

type ICDPSessionImplements = Pick<CDPSession, 'send' | 'on' | 'once' | 'addListener' | 'removeListener' | 'off' | 'prependListener' | 'detach'>;
type ICDPSessionImplementsMethods = keyof ICDPSessionImplements;

export class PageDevtoolsProtocolChromium extends PageDevtoolsProtocol implements ICDPSessionImplements
{
	/**
	 * @internal
	 */
	protected async _internalSessionMethod(method: Exclude<ICDPSessionImplementsMethods, 'send'>, args: any[])
	{
		const session = await this.getPageSession();
		// @ts-ignore
		return session[method](...args) as CDPSession;
	}

	send: CDPSession['send'] = async (...args) =>
	{
		const session = await this.getPageSession();
		return session.send(...args);
	}

	// @ts-ignore
	on: CDPSession['on'] = async (...args) =>
	{
		return this._internalSessionMethod('on', args);
	}

	// @ts-ignore
	once: CDPSession['once'] = async (...args) =>
	{
		return this._internalSessionMethod('once', args);
	}

	// @ts-ignore
	addListener: CDPSession['addListener'] = async (...args) =>
	{
		return this._internalSessionMethod('addListener', args);
	}

	// @ts-ignore
	removeListener: CDPSession['removeListener'] = async (...args) =>
	{
		return this._internalSessionMethod('removeListener', args);
	}

	// @ts-ignore
	off: CDPSession['off'] = async (...args) =>
	{
		return this._internalSessionMethod('off', args);
	}

	// @ts-ignore
	prependListener: CDPSession['prependListener'] = async (...args) =>
	{
		return this._internalSessionMethod('prependListener', args);
	}

	// @ts-ignore
	detach: CDPSession['detach'] = async (...args) =>
	{
		return this._internalSessionMethod('detach', args);
	}

}
