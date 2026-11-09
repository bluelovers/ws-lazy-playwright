/** `firefox_user_prefs` 的設定值型別 */
export type IFirefoxUserPrefs = Record<string, string | number | boolean>;

/**
 * Camoufox 的 `firefox_user_prefs` 預設值
 *
 * 目標是還原一般使用者的瀏覽行為，並放寬會阻斷 SSO 跨子網域傳遞的
 * Cookie 與同源政策 (Same-Origin Policy) 限制。
 * 未刻意開啟強化隱私選項，避免 Canvas 與時間軸行為變得異常。
 */
export function getCamoufoxFirefoxUserPrefs(): IFirefoxUserPrefs
{
	return {
		/** 關閉第三方 Cookie 阻擋 */
		'network.cookie.cookieBehavior': 0,

		/** 關閉 SameSite 預設 Strict/Lax 限制，允許跨子網域 Cookie 帶入 */
		'network.cookie.sameSite.laxByDefault': false,
		'network.cookie.sameSite.noneRequiresSecure': false,
		/** 關閉 Cookie 狀態分割 (CHIPS) */
		'network.cookie.CHIPS.enabled': false,

		/** 放寬跨網域同源政策，使 SSO 授權可順利傳遞 */
		'security.fileuri.strict_origin_policy': false,
		/** 關閉動態第一方隔離 (dFPI / State Partitioning) */
		'privacy.firstparty.isolate': false,
		'privacy.partition.network_state': false,
		/** 允許跨網域 Storage Access API */
		'dom.storage_access.enabled': false,

		/** 網站與瀏覽器介面語言 */
		'intl.accept_languages': 'zh-Hant,zh-TW,zh,en-US',
		'general.useragent.locale': 'zh-TW',
		'intl.locale.requested': 'zh-TW',
		'browser.translation.detectLanguage': true,

		/** 隱藏自動化測試標示 */
		'marionette.enabled': false,
		'dom.webdriver.enabled': false,

		/** 還原真實的 WebRTC 與 IP 行為 */
		'media.peerconnection.enabled': true,
		'media.navigator.permission.disabled': false,

		/** 還原 DRM 與硬體加速，使多媒體內容可正常解碼 */
		'media.eme.enabled': true,
		'layers.acceleration.disabled': false,
		'webgl.disabled': false,

		/** 還原 DNS / Link 預讀與並行連線等預載行為 */
		'network.dns.disablePrefetch': false,
		'network.prefetch-next': true,
		'network.http.speculative-parallel-limit': 6,

		/** 關閉增強型追蹤保護，避免影響特定 API 行為 */
		'privacy.trackingprotection.enabled': false,
		'privacy.trackingprotection.pbmode.enabled': false,
		/** 保持關閉：開啟會導致 Canvas 與時間軸行為異常 */
		'privacy.resistFingerprinting': false,
		/** 不強制進入無痕模式 */
		'browser.privatebrowsing.autostart': false,
	};
}
