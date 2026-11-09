import { filterCliArgsByPrefixes } from '../util/cli-args-filter';

/**
 * Firefox 不支援的 Chromium CLI 參數前綴
 *
 * Camoufox 基於 Firefox，從父類別繼承而來的 Chromium 專屬參數需先移除，
 * 避免啟動時產生警告或錯誤。
 */
const _UNSUPPORTED_FIREFOX_CLI_PREFIXES = [
	'--disable-features=',
	'--incognito=',
	'--lang=',
	/** Firefox 無此參數，改以 `-width` / `-height` 設定 */
	'--window-size=',
] as const;

/** 過濾 Firefox 不支援的 CLI 參數 */
export function _filterUnsupportedFirefoxCliArgs(args: readonly string[]): string[]
{
	return filterCliArgsByPrefixes(args, _UNSUPPORTED_FIREFOX_CLI_PREFIXES);
}
