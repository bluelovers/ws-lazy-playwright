/// <reference types="node" />
import { describe, test, type TestContext } from 'node:test';
import { BrowserStorageManager } from '../../lib/storage';
import {
	_asBrowserContext,
	_createFakeBrowserContext,
	type IFakeBrowserContext,
} from '../lib/helpers/fake-browser-context';
import { _createFakeStoragePersist, _createTestCookie } from '../lib/helpers/storage';

/** 登入情境：無頭 a 僅有匿名 Cookie；有頭 b 已完成登入（憑證 Cookie + origin localStorage） */
async function _createLoginScenario(): Promise<{
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
		[{ origin: 'https://example.com', localStorage: [{ name: 'token', value: 'abc' }] }],
	);

	// b 於有頭視窗完成登入，取得憑證 Cookie
	await b.addCookies([
		_createTestCookie({ name: 'user_session', value: 'secret', domain: '.example.com' }),
	]);

	return { manager, a, b };
}

describe('無頭 context a 遇到需要登入 → 有頭 context b 登入 → 傳回 a', () =>
{
	test('session 路徑：b 儲存 session 後還原至 a，a 取得憑證與 localStorage 注入', async (t: TestContext) =>
	{
		const { manager, a, b } = await _createLoginScenario();

		// a 缺少登入憑證 → 判定需要登入
		const before = await a.cookies();
		t.assert.strictEqual(before.some(cookie => cookie.name === 'user_session'), false);

		const saved = await manager.sessions.save('login', _asBrowserContext(b));

		t.assert.strictEqual(saved.payload.cookies.length, 1);
		t.assert.strictEqual(saved.payload.origins[0]?.localStorage[0]?.name, 'token');

		const restored = await manager.sessions.restore('login', _asBrowserContext(a));

		t.assert.strictEqual(restored, true);
		const after = await a.cookies();
		t.assert.ok(after.some(cookie => cookie.name === 'user_session' && cookie.value === 'secret'));
		t.assert.ok(after.some(cookie => cookie.name === 'anonymous'));
		t.assert.strictEqual(a.initScripts.length, 1);
		t.assert.ok(a.initScripts[0]?.includes('"token"'));
	});

	test('cookies 路徑：b 儲存 cookies 後套用至 a，a 取得憑證', async (t: TestContext) =>
	{
		const { manager, a, b } = await _createLoginScenario();

		const saved = await manager.cookies.save('login', _asBrowserContext(b));

		t.assert.strictEqual(saved.payload.length, 1);

		const applied = await manager.cookies.apply('login', _asBrowserContext(a));

		t.assert.strictEqual(applied, 1);
		const after = await a.cookies();
		t.assert.ok(after.some(cookie => cookie.name === 'user_session' && cookie.value === 'secret'));
		t.assert.ok(after.some(cookie => cookie.name === 'anonymous'));
	});
});
