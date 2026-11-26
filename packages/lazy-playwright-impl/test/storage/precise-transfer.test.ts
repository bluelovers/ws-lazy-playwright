/// <reference types="node" />
import { describe, test, type TestContext } from 'node:test';
import { _asBrowserContext } from '../lib/helpers/fake-browser-context';
import { _createLoginScenario } from '../lib/helpers/login-scenario';
import { _createTestSessionState } from '../lib/helpers/storage';

describe('精確轉移（filter + add）', () =>
{
	test('cookies 路徑：filter 僅選取憑證、add 併入 a 紀錄，轉移排除第三方 Cookie', async (t: TestContext) =>
	{
		const { manager, a, b } = await _createLoginScenario();

		await manager.cookies.save('a-state', _asBrowserContext(a));
		await manager.cookies.save('login', _asBrowserContext(b));

		// 精確選取：僅 .example.com 的憑證（不寫入）
		const precise = await manager.cookies.filter('login', cookie => cookie.domain === '.example.com');
		const preciseCookies = precise?.payload ?? [];

		t.assert.strictEqual(preciseCookies.length, 1);
		t.assert.strictEqual(preciseCookies[0]?.name, 'user_session');

		// 精確併入 a 的既有紀錄（不寫入）
		const merged = await manager.cookies.add('a-state', preciseCookies);

		t.assert.strictEqual(merged.payload.length, 2);

		await manager.cookies.save('a-state', merged.payload);
		const applied = await manager.cookies.apply('a-state', _asBrowserContext(a));

		t.assert.strictEqual(applied, 2);
		const after = await a.cookies();
		t.assert.ok(after.some(cookie => cookie.name === 'user_session' && cookie.value === 'secret'));
		t.assert.ok(after.some(cookie => cookie.name === 'anonymous'));
		t.assert.strictEqual(after.some(cookie => cookie.name === 'tracking_id'), false);
		t.assert.snapshot(await a.cookies());
	});

	test('session 路徑：filter 僅選取憑證與目標 origin，restore 後排除第三方內容', async (t: TestContext) =>
	{
		const { manager, a, b } = await _createLoginScenario();

		await manager.sessions.save('a-state', _asBrowserContext(a));
		await manager.sessions.save('login', _asBrowserContext(b));

		// 精確選取：僅 .example.com 的 Cookie 與 https://example.com 的 origin（不寫入）
		const precise = await manager.sessions.filter('login', {
			cookie: cookie => cookie.domain === '.example.com',
			origin: origin => origin.origin === 'https://example.com',
		});
		const preciseState = precise?.payload ?? _createTestSessionState();

		t.assert.strictEqual(preciseState.cookies.length, 1);
		t.assert.strictEqual(preciseState.origins.length, 1);

		// 精確併入 a 的既有紀錄（不寫入）
		const merged = await manager.sessions.add('a-state', preciseState);

		t.assert.strictEqual(merged.payload.cookies.length, 2);
		t.assert.strictEqual(merged.payload.origins.length, 1);

		await manager.sessions.save('a-state', merged.payload);
		const restored = await manager.sessions.restore('a-state', _asBrowserContext(a));

		t.assert.strictEqual(restored, true);
		const after = await a.cookies();
		t.assert.ok(after.some(cookie => cookie.name === 'user_session'));
		t.assert.ok(after.some(cookie => cookie.name === 'anonymous'));
		t.assert.strictEqual(after.some(cookie => cookie.name === 'tracking_id'), false);
		t.assert.strictEqual(a.initScripts.length, 1);
		t.assert.ok(a.initScripts[0]?.includes('"token"'));
		t.assert.snapshot({ cookies: await a.cookies(), initScripts: [...a.initScripts] });
	});
});
