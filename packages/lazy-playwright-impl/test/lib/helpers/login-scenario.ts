/// <reference types="node" />
import { BrowserStorageManager } from '../../../lib/storage';
import {
	_asBrowserContext,
	_createFakeBrowserContext,
	type IFakeBrowserContext,
} from './fake-browser-context';
import { _createFakeStoragePersist, _createTestCookie } from './storage';

/**
 * 登入情境：無頭 a 僅有匿名 Cookie；
 * 有頭 b 已完成登入（憑證 Cookie + origin localStorage），並夾帶第三方追蹤 Cookie 與 origin
 */
export async function _createLoginScenario(): Promise<{
	manager: BrowserStorageManager;
	a: IFakeBrowserContext;
	b: IFakeBrowserContext;
}>
{
	const manager = new BrowserStorageManager({
		persist: _createFakeStoragePersist(),
	});

	const a = _createFakeBrowserContext([
		_createTestCookie({ name: 'anonymous', domain: '.example.com' }),
	]);
	const b = _createFakeBrowserContext(
		[],
		[
			{ origin: 'https://example.com', localStorage: [{ name: 'token', value: 'abc' }] },
			{ origin: 'https://tracker.com', localStorage: [{ name: 'tid', value: 't1' }] },
		],
	);

	// b 於有頭視窗完成登入，取得憑證 Cookie，同時夾帶第三方追蹤 Cookie
	await b.addCookies([
		_createTestCookie({ name: 'user_session', value: 'secret', domain: '.example.com' }),
		_createTestCookie({ name: 'tracking_id', domain: '.tracker.com' }),
	]);

	return { manager, a, b };
}
