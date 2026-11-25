/// <reference types="node" />
import { describe, test, type TestContext } from 'node:test';
import { CookieStore } from '../../lib/storage/cookie-store';
import { EnumStorageKind } from '../../lib/storage/types';
import {
	__TEST_STORAGE_ID,
	__TEST_UPDATED_AT,
	_createFakeStoragePersist,
	_createTestCookie,
	_createTestRecord,
} from '../lib/helpers/storage';

describe('CookieStore', () =>
{
	test('build 回傳組裝後的紀錄且不執行 write', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new CookieStore(persist);
		const cookies = [_createTestCookie({ name: 'a' }), _createTestCookie({ name: 'b' })];

		const record = await store.build(__TEST_STORAGE_ID, cookies);

		t.assert.strictEqual(record.kind, EnumStorageKind.Cookie);
		t.assert.strictEqual(record.id, __TEST_STORAGE_ID);
		t.assert.deepStrictEqual(record.payload, cookies);
		t.assert.strictEqual(persist.writes.length, 0);
		t.assert.strictEqual(await store.load(__TEST_STORAGE_ID), undefined);
	});

	test('save 寫入後可讀取', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new CookieStore(persist);
		const cookies = [_createTestCookie({ name: 'a' })];

		await store.save(__TEST_STORAGE_ID, cookies);

		t.assert.strictEqual(persist.writes.length, 1);
		t.assert.deepStrictEqual(await store.load(__TEST_STORAGE_ID), cookies);
	});

	test('add 併入既有紀錄且不執行 write', async (t: TestContext) =>
	{
		const existing = [_createTestCookie({ name: 'old', domain: '.old.com' })];
		const persist = _createFakeStoragePersist([
			_createTestRecord(EnumStorageKind.Cookie, existing),
		]);
		const store = new CookieStore(persist);
		const incoming = [_createTestCookie({ name: 'new', domain: '.new.com' })];

		const record = await store.add(__TEST_STORAGE_ID, incoming);

		t.assert.strictEqual(record.payload.length, 2);
		t.assert.ok(record.payload.some(cookie => cookie.name === 'old'));
		t.assert.ok(record.payload.some(cookie => cookie.name === 'new'));
		t.assert.strictEqual(persist.writes.length, 0);
		t.assert.deepStrictEqual(await store.load(__TEST_STORAGE_ID), existing);
	});

	test('add 無既有紀錄時等同 build 且不執行 write', async (t: TestContext) =>
	{
		const persist = _createFakeStoragePersist();
		const store = new CookieStore(persist);
		const incoming = [_createTestCookie({ name: 'solo' })];

		const record = await store.add(__TEST_STORAGE_ID, incoming);

		t.assert.deepStrictEqual(record.payload, incoming);
		t.assert.strictEqual(persist.writes.length, 0);
	});

	test('filter 依條件過濾既有紀錄（保留 updatedAt、不執行 write）', async (t: TestContext) =>
	{
		const payload = [
			_createTestCookie({ name: 'keep', domain: '.keep.com' }),
			_createTestCookie({ name: 'drop', domain: '.drop.com' }),
		];
		const persist = _createFakeStoragePersist([
			_createTestRecord(EnumStorageKind.Cookie, payload),
		]);
		const store = new CookieStore(persist);

		const record = await store.filter(__TEST_STORAGE_ID, cookie => cookie.domain === '.keep.com');

		t.assert.strictEqual(record?.payload.length, 1);
		t.assert.strictEqual(record?.payload[0]?.name, 'keep');
		t.assert.strictEqual(record?.updatedAt, __TEST_UPDATED_AT);
		t.assert.strictEqual(persist.writes.length, 0);
	});

	test('filter 無既有紀錄時回傳 undefined', async (t: TestContext) =>
	{
		const store = new CookieStore(_createFakeStoragePersist());

		t.assert.strictEqual(await store.filter(__TEST_STORAGE_ID, () => true), undefined);
	});
});
