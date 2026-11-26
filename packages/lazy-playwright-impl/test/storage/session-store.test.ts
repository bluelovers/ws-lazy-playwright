/// <reference types="node" />
import { describe, test, type TestContext } from 'node:test';
import { SessionStore } from '@lazy-playwright/storage/lib/session-store';
import { EnumStorageKind } from '@lazy-playwright/storage/lib/types';
import {
	__TEST_STORAGE_ID,
	__TEST_UPDATED_AT,
	_createFakeStoragePersist,
	_createTestCookie,
	_createTestRecord,
	_createTestSessionState,
} from '../lib/helpers/storage';

describe('SessionStore', () =>
{
	test('build 回傳組裝後的紀錄且不執行 write', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new SessionStore(persist);
		const state = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'a' })],
			origins: [{ origin: 'https://example.com', localStorage: [{ name: 'k', value: 'v' }] }],
		});

		const record = await store.build(__TEST_STORAGE_ID, state);

		t.assert.strictEqual(record.kind, EnumStorageKind.Session);
		t.assert.strictEqual(record.id, __TEST_STORAGE_ID);
		t.assert.deepStrictEqual(record.payload, state);
		t.assert.strictEqual(persist.writes.length, 0);
		t.assert.strictEqual(await store.load(__TEST_STORAGE_ID), undefined);
	});

	test('save 寫入後可讀取', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new SessionStore(persist);
		const state = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'a' })],
		});

		await store.save(__TEST_STORAGE_ID, state);

		t.assert.strictEqual(persist.writes.length, 1);
		t.assert.deepStrictEqual(await store.load(__TEST_STORAGE_ID), state);
	});

	test('add 併入既有 cookies 與 origins 且不執行 write', async (t: TestContext) =>
	{
		const existing = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'old', domain: '.old.com' })],
			origins: [{ origin: 'https://old.com', localStorage: [] }],
		});
		const persist = _createFakeStoragePersist([
			_createTestRecord(EnumStorageKind.Session, existing),
		]);
		const store = new SessionStore(persist);
		const incoming = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'new', domain: '.new.com' })],
			origins: [{ origin: 'https://new.com', localStorage: [] }],
		});

		const record = await store.add(__TEST_STORAGE_ID, incoming);

		t.assert.strictEqual(record.payload.cookies.length, 2);
		t.assert.strictEqual(record.payload.origins.length, 2);
		t.assert.strictEqual(persist.writes.length, 0);
		t.assert.deepStrictEqual(await store.load(__TEST_STORAGE_ID), existing);
	});

	test('add 無既有紀錄時等同 build 且不執行 write', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new SessionStore(persist);
		const incoming = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'solo' })],
		});

		const record = await store.add(__TEST_STORAGE_ID, incoming);

		t.assert.deepStrictEqual(record.payload, incoming);
		t.assert.strictEqual(persist.writes.length, 0);
	});

	test('filter 依 cookie 條件過濾（origin 全數保留、不執行 write）', async (t: TestContext) =>
	{
		const payload = _createTestSessionState({
			cookies: [
				_createTestCookie({ name: 'keep', domain: '.keep.com' }),
				_createTestCookie({ name: 'drop', domain: '.drop.com' }),
			],
			origins: [{ origin: 'https://keep.com', localStorage: [] }],
		});
		const persist = _createFakeStoragePersist([
			_createTestRecord(EnumStorageKind.Session, payload),
		]);
		const store = new SessionStore(persist);

		const record = await store.filter(__TEST_STORAGE_ID, {
			cookie: cookie => cookie.domain === '.keep.com',
		});

		t.assert.strictEqual(record?.payload.cookies.length, 1);
		t.assert.strictEqual(record?.payload.cookies[0]?.name, 'keep');
		t.assert.strictEqual(record?.payload.origins.length, 1);
		t.assert.strictEqual(record?.updatedAt, __TEST_UPDATED_AT);
		t.assert.strictEqual(persist.writes.length, 0);
	});

	test('filter 依 origin 條件過濾（cookies 全數保留）', async (t: TestContext) =>
	{
		const payload = _createTestSessionState({
			cookies: [_createTestCookie({ name: 'only' })],
			origins: [
				{ origin: 'https://keep.com', localStorage: [] },
				{ origin: 'https://drop.com', localStorage: [] },
			],
		});
		const persist = _createFakeStoragePersist([
			_createTestRecord(EnumStorageKind.Session, payload),
		]);
		const store = new SessionStore(persist);

		const record = await store.filter(__TEST_STORAGE_ID, {
			origin: origin => origin.origin === 'https://keep.com',
		});

		t.assert.strictEqual(record?.payload.origins.length, 1);
		t.assert.strictEqual(record?.payload.origins[0]?.origin, 'https://keep.com');
		t.assert.strictEqual(record?.payload.cookies.length, 1);
	});

	test('filter 無既有紀錄時回傳 undefined', async (t: TestContext) =>
	{
		const store = new SessionStore(_createFakeStoragePersist());

		t.assert.strictEqual(await store.filter(__TEST_STORAGE_ID, {}), undefined);
	});
});
