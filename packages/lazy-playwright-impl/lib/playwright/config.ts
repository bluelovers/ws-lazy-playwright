/**
 * 需以 `--disable-features` 關閉的 Chromium features：
 * 第三方 Cookie 阻擋、SameSite 預設限制、Cookie 狀態分割 (CHIPS)，
 * 讓跨子網域的 Cookie 帶入與 SSO 傳遞不受阻斷。
 */
export const disableFeatures: readonly string[] = [
	'BlockThirdPartyCookies',
	'ThirdPartyCookieBlocking',
	'SameSiteByDefaultCookies',
	'CookiesWithoutSameSiteMustBeSecure',
	'PartitionedCookies',
];

/** 產生 `--disable-features` CLI 參數；重複項目以 Set 去除 */
export function _playwrightArgsDisableFeatures(): string
{
	return `--disable-features=${[...new Set(disableFeatures)].join(',')}`;
}
