import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import {
	filterUnsupportedCliArgs,
	registerUnsupportedCliArgs,
} from '../util/cli-args-filter';
import { IBrowserLaunchArgs } from '../types/browser-setting';

/**
 * Firefox 不支援的 Chromium CLI 參數前綴
 *
 * Camoufox 基於 Firefox，從父類別繼承而來的 Chromium 專屬參數需先移除，
 * 避免啟動時產生警告或錯誤。
 * 各設定模組另行註冊其專屬前綴（如 `--window-size=` 由 `opt-window-size` 註冊）。
 */
const _UNSUPPORTED_FIREFOX_CLI_PREFIXES = [
	'--disable-features=',
	'--incognito=',
	'--lang=',
] as const;

/** 載入時註冊 Firefox 不支援的參數前綴，供通用過濾器按 `baseKind` 取用 */
registerUnsupportedCliArgs(EnumAutomationEngine.Firefox, _UNSUPPORTED_FIREFOX_CLI_PREFIXES);

/** 過濾 Firefox 不支援的 CLI 參數 */
export function _filterUnsupportedFirefoxCliArgs(args: IBrowserLaunchArgs): string[]
{
	return filterUnsupportedCliArgs(EnumAutomationEngine.Firefox, args);
}
