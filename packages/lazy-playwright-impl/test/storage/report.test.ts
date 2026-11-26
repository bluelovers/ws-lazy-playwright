/// <reference types="node" />
import type { Cookie } from 'playwright';
import { describe, test, type TestContext } from 'node:test';
import {
	createStorageReport,
	diffStorageReport,
	formatStorageReport,
	formatStorageReportDiff,
} from '@lazy-playwright/storage/lib/report';
import { EnumStorageKind } from '@lazy-playwright/storage/lib/types';
import type { IOriginState, IStorageRecord, ISessionState } from '@lazy-playwright/storage/lib/types';
import {
	__TEST_UPDATED_AT,
	_createTestCookie,
	_createTestRecord,
	_createTestSessionState,
} from '../lib/helpers/storage';

/** 以指定 cookies 與 origins 建立 session 紀錄 */
function _createSessionRecord(cookies: Cookie[], origins: IOriginState[] = []): IStorageRecord<ISessionState>
{
	return _createTestRecord(EnumStorageKind.Session, _createTestSessionState({ cookies, origins }));
}

describe('storage report', () =>
{
	test('依 . 基底分組：裸網域歸入所屬基底，無基底者自成一組', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.civitai.com' }),
			_createTestCookie({ domain: 'auth.civitai.com' }),
			_createTestCookie({ domain: '.civitai.red' }),
			_createTestCookie({ domain: 'civitai.red' }),
			_createTestCookie({ domain: 'solo.example.org' }),
		]));
		const groups = new Map(report.groups.map(group => [group.domain, group]));

		t.assert.strictEqual(groups.size, 3);
		t.assert.strictEqual(groups.get('.civitai.com')?.count, 2);
		t.assert.strictEqual(groups.get('.civitai.red')?.count, 2);
		t.assert.strictEqual(groups.get('solo.example.org')?.count, 1);
		t.assert.snapshot(report.groups.map(group => ({
			domain: group.domain,
			count: group.count,
			domains: group.domains,
		})));
	});

	test('.civitai.com 存在時 .advertising.civitai.com 歸入該組', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.civitai.com' }),
			_createTestCookie({ domain: '.advertising.civitai.com' }),
			_createTestCookie({ domain: 'auth.civitai.com' }),
		]));
		const group = report.groups.find(item => item.domain === '.civitai.com');

		t.assert.strictEqual(report.groups.length, 1);
		t.assert.strictEqual(group?.count, 3);
		t.assert.deepStrictEqual(group?.domains, {
			'.advertising.civitai.com': 1,
			'.civitai.com': 1,
			'auth.civitai.com': 1,
		});
	});

	test('無上層基底的 . 網域自成一組', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.advertising.civitai.com' }),
			_createTestCookie({ domain: 'advertising.civitai.com' }),
		]));

		t.assert.strictEqual(report.groups.length, 1);
		t.assert.strictEqual(report.groups[0]?.domain, '.advertising.civitai.com');
		t.assert.strictEqual(report.groups[0]?.count, 2);
	});

	test('origin 的 hostname 納入所屬分組', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord(
			[_createTestCookie({ domain: '.civitai.red' })],
			[{ origin: 'https://civitai.red', localStorage: [] }],
		));
		const group = report.groups.find(item => item.domain === '.civitai.red');

		t.assert.strictEqual(report.cookies, 1);
		t.assert.strictEqual(report.origins, 1);
		t.assert.strictEqual(group?.count, 2);
		t.assert.deepStrictEqual(group?.domains, {
			'.civitai.red': 1,
			'civitai.red': 1,
		});
	});

	test('cookie 紀錄僅計 cookies', (t: TestContext) =>
	{
		const report = createStorageReport(_createTestRecord(EnumStorageKind.Cookie, [
			_createTestCookie({ domain: '.a.com' }),
			_createTestCookie({ domain: '.b.com' }),
		]));

		t.assert.strictEqual(report.cookies, 2);
		t.assert.strictEqual(report.origins, 0);
		t.assert.strictEqual(report.total, 2);
		t.assert.strictEqual(report.groups.length, 2);
	});

	test('updatedAt 提供人類可讀格式', (t: TestContext) =>
	{
		const report = createStorageReport(_createTestRecord(EnumStorageKind.Cookie, []));

		t.assert.strictEqual(report.updatedAt, __TEST_UPDATED_AT);
		t.assert.match(report.updatedAtDate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		t.assert.ok(Math.abs(report.updatedAtSeconds - __TEST_UPDATED_AT / 1000) < 0.001);
	});

	test('diff 回報更改前後的總數與分組差異', (t: TestContext) =>
	{
		const before = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com' }),
			_createTestCookie({ domain: '.b.com' }),
		]));
		const after = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com', name: 'a1' }),
			_createTestCookie({ domain: '.a.com', name: 'a2' }),
			_createTestCookie({ domain: '.c.com' }),
		]));

		const diff = diffStorageReport(before, after);

		t.assert.strictEqual(diff.total, 1);
		t.assert.deepStrictEqual(diff.groups, {
			'.a.com': 1,
			'.b.com': -1,
			'.c.com': 1,
		});
	});

	test('diff 首次儲存以 0 為基準', (t: TestContext) =>
	{
		const after = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com' }),
			_createTestCookie({ domain: '.a.com', name: 'a2' }),
		]));

		const diff = diffStorageReport(undefined, after);

		t.assert.strictEqual(diff.before, undefined);
		t.assert.strictEqual(diff.total, 2);
		t.assert.deepStrictEqual(diff.groups, { '.a.com': 2 });
	});

	test('diff 無變動時差異為空（CLI 顯示 no change）', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com' }),
		]));

		const diff = diffStorageReport(report, report);

		t.assert.strictEqual(diff.total, 0);
		t.assert.deepStrictEqual(diff.groups, {});
		t.assert.ok(formatStorageReportDiff(diff).includes('groups: no change'));
	});

	test('formatStorageReport 輸出總數與分組數量', (t: TestContext) =>
	{
		const report = createStorageReport(_createSessionRecord(
			[_createTestCookie({ domain: '.civitai.red' })],
			[{ origin: 'https://civitai.red', localStorage: [] }],
		));

		const text = formatStorageReport(report);

		t.assert.match(text, /^\[session\] default @ \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/m);
		t.assert.ok(text.includes('total 2 (cookies 1, origins 1)'));
		t.assert.ok(text.includes('  .civitai.red: 2'));
		t.assert.ok(text.includes('    civitai.red: 1'));
		t.assert.snapshot(text.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '<DATE>'));
	});

	test('formatStorageReportDiff 輸出前後差異', (t: TestContext) =>
	{
		const before = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com' }),
			_createTestCookie({ domain: '.b.com' }),
		]));
		const after = createStorageReport(_createSessionRecord([
			_createTestCookie({ domain: '.a.com', name: 'a1' }),
			_createTestCookie({ domain: '.a.com', name: 'a2' }),
			_createTestCookie({ domain: '.c.com' }),
		]));

		const text = formatStorageReportDiff(diffStorageReport(before, after));

		t.assert.match(text, /updatedAt: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} -> \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
		t.assert.ok(text.includes('total: 2 -> 3 (+1)'));
		t.assert.ok(text.includes('.a.com: 1 -> 2 (+1)'));
		t.assert.ok(text.includes('.b.com: 1 -> 0 (-1)'));
		t.assert.snapshot(text.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '<DATE>'));
	});
});
