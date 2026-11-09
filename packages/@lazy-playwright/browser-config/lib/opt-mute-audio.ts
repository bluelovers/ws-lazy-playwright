import { _handleBrowserKind, EnumAutomationEngine } from '@lazy-playwright/shared-types';
import {
	EnumSettingPlacement,
	type IArgsSetting,
	type ILaunchOptionsSetting,
	type IBrowserSettingResult,
} from './browser-setting';

/** Chromium 專屬的靜音音頻啟動參數 */
const _CHROMIUM_MUTE_AUDIO_ARGS = ['--mute-audio'] as const;

/** Firefox 以啟動偏好限制媒體音量（Camoufox / Firefox） */
const _FIREFOX_MUTE_AUDIO_PREFS = {
	/** 全域音量設為 0 */
	'media.volume_scale': '0.0',
} as const;

/** 靜音音頻的投放結果：僅可能落在 `args` 或 `LaunchOptions` */
export type IMuteAudioSetting = IArgsSetting | ILaunchOptionsSetting;

/** 靜音音頻的解析輸入 */
export interface IResolveMuteAudioOptions
{
	/** 引擎 / 瀏覽器種類，由 {@link _handleBrowserKind} 歸一化為 `baseKind` */
	browserEngine: EnumAutomationEngine;
	/** 已存在的啟動參數，避免重複輸出 */
	args?: readonly string[];
	/** 已存在的 `firefoxUserPrefs`，避免重複輸出 */
	firefoxUserPrefs?: Record<string, string | number | boolean>;
}

/** 靜音音頻的解析結果 */
export type IResolveMuteAudioResult = IBrowserSettingResult<IMuteAudioSetting>;

/**
 * 解析靜音音頻的跨瀏覽器設定
 *
 * - Chromium：以 `--mute-audio` 啟動參數靜音；
 * - Firefox：以 `firefoxUserPrefs` 的 `media.volume_scale` 將全域音量設為 0。
 *
 * 設定已存在時回傳空 payload，消費端可統一以附加 / 淺層合併處理。
 */
export function resolveMuteAudio(options: IResolveMuteAudioOptions): IResolveMuteAudioResult
{
	const { browserEngine, args = [], firefoxUserPrefs } = options;
	const { baseKind } = _handleBrowserKind(browserEngine);

	if (baseKind === EnumAutomationEngine.Firefox)
	{
		/** 已設定過全域音量時回傳空物件，交由消費端統一合併 */
		const applied = firefoxUserPrefs != null && 'media.volume_scale' in firefoxUserPrefs;

		return {
			baseKind,
			placement: EnumSettingPlacement.LaunchOptions,
			launchOptions: applied ? {} : { firefoxUserPrefs: _FIREFOX_MUTE_AUDIO_PREFS },
		};
	}

	/** 已帶有靜音參數時回傳空陣列，避免重複輸出 */
	const applied = args.includes('--mute-audio');

	return {
		baseKind,
		placement: EnumSettingPlacement.Args,
		args: applied ? [] : _CHROMIUM_MUTE_AUDIO_ARGS,
	};
}
