import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import { _handleBrowserKind, EnumAutomationEngine, type IBrowserKind } from '@lazy-playwright/shared-types';
import { ITSPickExtra, ITSRequiredPick } from 'ts-type';

/**
 * browser type 的最小啟動契約（結構相容 Playwright 的 `launch`）
 *
 * 外部邏輯只要提供相容的 `launch` 即可被組裝成類 Playwright API。
 */
export type IPlaywrightBrowserType = ITSPickExtra<BrowserType, 'launch'>;

/** 相容於 Playwright 的模組 API；各入口可缺漏，實際支援由模組宣告或入口存在與否判定 */
export interface IPlaywrightCompatibleApi<T extends IPlaywrightBrowserType = IPlaywrightBrowserType>
{
	[EnumAutomationEngine.Chromium]?: T;
	[EnumAutomationEngine.Firefox]?: T;
	[EnumAutomationEngine.Webkit]?: T;
}

/**
 * 可註冊的 Playwright 相容模組描述
 *
 * @example
 * // patchright：反偵測分支，僅支援 chromium
 * const patchright = await import('patchright');
 * playwrightModuleRegistry.register({
 * 	id: 'patchright',
 * 	api: { chromium: patchright.chromium },
 * 	unsupportedBrowsers: [EnumAutomationEngine.Firefox, EnumAutomationEngine.Webkit],
 * });
 *
 * // 外部邏輯組裝成類 Playwright API
 * playwrightModuleRegistry.register({
 * 	id: 'custom',
 * 	api: { chromium: { launch: options => externalLaunch(options) } },
 * 	supportedBrowsers: [EnumAutomationEngine.Chromium],
 * });
 */
export interface IPlaywrightModule<T extends IPlaywrightBrowserType = IPlaywrightBrowserType>
{
	/** 模組識別碼：註冊與依參數切換的依據 */
	id: IPlaywrightModuleId;
	/** 類 Playwright 的啟動 API */
	api: IPlaywrightCompatibleApi<T>;
	/** 明確宣告支援的瀏覽器種類；省略時以 api 具備的入口判定 */
	supportedBrowsers?: readonly IBrowserKind[];
	/** 明確宣告不支援的瀏覽器種類，優先於 supportedBrowsers（例：patchright 僅 chromium） */
	unsupportedBrowsers?: readonly IBrowserKind[];
}

/** 預設相容模組識別碼 */
export const DEFAULT_PLAYWRIGHT_MODULE_ID = EnumAutomationEngine.Playwright;

export type IPlaywrightModuleId = typeof DEFAULT_PLAYWRIGHT_MODULE_ID | (string & {});

/** 判定模組是否支援指定瀏覽器種類 */
export function _isBrowserKindSupported<T extends IPlaywrightModule, K extends IBrowserKind = IBrowserKind>(module: T, kind: K): module is T & {
	api: ITSRequiredPick<T['api'], K>
}
{
	if (module.unsupportedBrowsers?.includes(kind))
	{
		return false;
	}

	if (module.supportedBrowsers)
	{
		return module.supportedBrowsers.includes(kind);
	}

	return !!module.api[kind];
}

/**
 * 解析模組在指定瀏覽器種類的啟動入口
 *
 * 支援宣告與 api 入口一併驗證，失敗時拋出含模組 id 與瀏覽器種類的錯誤。
 */
export function resolveBrowserType(module: IPlaywrightModule, kind: IBrowserKind): IPlaywrightBrowserType
{
	kind = _handleBrowserKind(kind).browserKind;

	const browserType = _isBrowserKindSupported(module, kind)
		? module.api[kind]
		: undefined;

	if (!browserType)
	{
		throw new Error(`Playwright module "${module.id}" does not support browser kind "${kind}"`);
	}

	return browserType;
}

/**
 * Playwright 相容模組註冊表
 *
 * 可同時註冊多個相容模組，使用時以 id（或直接傳入模組描述）配合瀏覽器種類切換；
 * 重複註冊同 id 會以最新的模組覆寫。
 */
export class PlaywrightModuleRegistry
{
	protected readonly _modules = new Map<IPlaywrightModuleId, IPlaywrightModule>();

	/** 已註冊的模組 id */
	get ids(): readonly IPlaywrightModuleId[]
	{
		return [...this._modules.keys()];
	}

	/** 註冊相容模組；同 id 重複註冊會覆寫 */
	register<T extends IPlaywrightBrowserType = IPlaywrightBrowserType>(module: IPlaywrightModule<T>): this
	{
		if (!module?.id)
		{
			throw new TypeError('playwright module id is required');
		}

		this._modules.set(module.id, module);
		return this;
	}

	/** 取得註冊的模組，未註冊回傳 undefined */
	get<T extends IPlaywrightBrowserType = IPlaywrightBrowserType>(id: IPlaywrightModuleId): IPlaywrightModule<T> | undefined
	{
		return this._modules.get(id) as IPlaywrightModule<T>;
	}

	/** 取得註冊的模組，未註冊時拋出含已註冊清單的錯誤 */
	require<T extends IPlaywrightBrowserType = IPlaywrightBrowserType>(id: IPlaywrightModuleId): IPlaywrightModule<T>
	{
		const module = this.get<T>(id);

		if (!module)
		{
			throw new Error(`Playwright module "${id}" is not registered; registered: [${this.ids.join(', ')}]`);
		}

		return module;
	}

	/**
	 * 解析目標模組並驗證其支援指定瀏覽器種類
	 *
	 * @param target - 已註冊的模組 id，或直接提供的模組描述
	 * @param browserKind - 預計啟動的瀏覽器種類
	 */
	resolve<T extends IPlaywrightBrowserType = IPlaywrightBrowserType, K extends IBrowserKind = IBrowserKind>(target: IPlaywrightModuleId | IPlaywrightModule, browserKind: K)
	{
		const module: IPlaywrightModule<T> = typeof target === 'string' ? this.require(target) : target as IPlaywrightModule<T>;

		if (!_isBrowserKindSupported(module, browserKind))
		{
			throw new Error(`Playwright module "${module.id}" does not support browser kind "${browserKind}"; registered: [${this.ids.join(', ')}]`);
		}

		return module;
	}
}

/** 全域相容模組註冊表 */
export const playwrightModuleRegistry = new PlaywrightModuleRegistry();

playwrightModuleRegistry.register({
	id: DEFAULT_PLAYWRIGHT_MODULE_ID,
	api: { chromium, firefox, webkit },
});
