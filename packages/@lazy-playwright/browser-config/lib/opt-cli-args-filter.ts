
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';
import { _CHROMIUM_MUTE_AUDIO_ARGS } from './opt-mute-audio';
import { _filterUnsupportedCliArgsCore, registerUnsupportedCliArgs } from './util/cli-args-filter';

/**
 * 過濾指定瀏覽器不支援的 CLI 參數
 *
 * 以該瀏覽器已註冊的前綴集合過濾；未註冊任何前綴時原樣保留（回傳新陣列）。
 *
 * 刻意 re-export _filterUnsupportedCliArgsCore 來確保此模組的註冊邏輯被執行。
 */
export const filterUnsupportedCliArgs = _filterUnsupportedCliArgsCore;

/**
 * 防止可能被打包工具（如 Rollup/Webpack）因 Tree-shaking 而移除的問題
 * 進而導致瀏覽器不支援的參數未被正確過濾。
 */
(() =>
{

	/* === Firefox 不支援的參數 === */

	registerUnsupportedCliArgs(EnumAutomationEngine.Firefox, [
		'--disable-features=',
		'--incognito=',
		'--lang=',
	] as const);

	/* === --mute-audio === */

	registerUnsupportedCliArgs(EnumAutomationEngine.Firefox, _CHROMIUM_MUTE_AUDIO_ARGS);

	/**
	 * `--window-size=` 為 Chromium 風格，Firefox 無此參數、改以 `-width` / `-height` 設定；
	 * `-width` / `-height` 為 Firefox 風格，Chromium 不支援。
	 */
	registerUnsupportedCliArgs(EnumAutomationEngine.Firefox, ['--window-size=']);
	registerUnsupportedCliArgs(EnumAutomationEngine.Chromium, ['-width', '-height']);

})();
