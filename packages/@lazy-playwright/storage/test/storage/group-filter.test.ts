/// <reference types="node" />
import type { Cookie } from 'playwright';
import { describe, test, type TestContext } from 'node:test';
import { BrowserStorageManager } from '../../lib';
import {
	createStorageReport,
	isDomainInGroup,
	type IDomainGroupReport,
	type IStorageReport,
} from '../../lib/report';
import type { IStorageRecord } from '../../lib/types';
import { _createFakeStoragePersist, _createTestCookie } from '../lib/helpers/storage';

/** 以分組報告建立「所屬分組」的 filter 條件（分組算法與報告同源） */
function _createGroupFilter(report: IStorageReport, domain: string): {
	group: IDomainGroupReport | undefined;
	test(cookie: Cookie): boolean;
}
{
	const group = report.groups.find(item => item.domain === domain);
	const members = new Set(Object.keys(group?.domains ?? {}));

	return {
		group,
		test: cookie => members.has(cookie.domain),
	};
}

/** 建立混合網域的儲存紀錄：`.civitai.com` 組（三種網域形式）、`.civitai.red` 組（含裸網域）、獨立的 `.tracker.com` 與無基底的 solo 網域族 */
async function _createMixedStore(): Promise<{
	manager: BrowserStorageManager;
	record: IStorageRecord<Cookie[]>;
}>
{
	const manager = new BrowserStorageManager({
		persist: _createFakeStoragePersist(),
	});
	const record = await manager.cookies.save('mixed', [
		_createTestCookie({ name: 'civ_base', domain: '.civitai.com' }),
		_createTestCookie({ name: 'civ_sub', domain: 'auth.civitai.com' }),
		_createTestCookie({ name: 'civ_adv', domain: '.advertising.civitai.com' }),
		_createTestCookie({ name: 'red_base', domain: '.civitai.red' }),
		_createTestCookie({ name: 'red_bare', domain: 'civitai.red' }),
		_createTestCookie({ name: 'tracking_id', domain: '.tracker.com' }),
		_createTestCookie({ name: 'solo', domain: 'solo.example.org' }),
		_createTestCookie({ name: 'solo_sub', domain: 'www.solo.example.org' }),
	]);

	return { manager, record };
}

describe('以分組算法驅動 filter', () =>
{
	test('以分組鍵過濾：整組網域（裸網域與子網域）一次選取', async (t: TestContext) =>
	{
		const { manager, record } = await _createMixedStore();
		const civFilter = _createGroupFilter(createStorageReport(record), '.civitai.com');

		// 分組算法涵蓋該組的各種網域形式（含 `.advertising` 子網域）
		t.assert.strictEqual(civFilter.group?.count, 3);
		t.assert.deepStrictEqual(civFilter.group?.domains, {
			'.advertising.civitai.com': 1,
			'.civitai.com': 1,
			'auth.civitai.com': 1,
		});

		const filtered = await manager.cookies.filter('mixed', civFilter.test);

		t.assert.deepStrictEqual(
			(filtered?.payload ?? []).map(cookie => cookie.name).sort(),
			['civ_adv', 'civ_base', 'civ_sub'],
		);
	});

	test('以分組鍵過濾：裸網域隨其 . 基底整組選取', async (t: TestContext) =>
	{
		const { manager, record } = await _createMixedStore();
		const redFilter = _createGroupFilter(createStorageReport(record), '.civitai.red');

		t.assert.strictEqual(redFilter.group?.count, 2);
		t.assert.deepStrictEqual(redFilter.group?.domains, {
			'.civitai.red': 1,
			'civitai.red': 1,
		});

		const filtered = await manager.cookies.filter('mixed', redFilter.test);

		t.assert.deepStrictEqual(
			(filtered?.payload ?? []).map(cookie => cookie.name).sort(),
			['red_bare', 'red_base'],
		);
	});
});

describe('不依賴分組結果建立 filter', () =>
{
	test('以分組鍵直接過濾：無需先產生分組報告', async (t: TestContext) =>
	{
		const { manager } = await _createMixedStore();

		const filtered = await manager.cookies.filter('mixed',
			cookie => isDomainInGroup(cookie.domain, '.civitai.com'));

		t.assert.deepStrictEqual(
			(filtered?.payload ?? []).map(cookie => cookie.name).sort(),
			['civ_adv', 'civ_base', 'civ_sub'],
		);
	});

	test('非 . 分組鍵僅精確相符，不吸收子網域', async (t: TestContext) =>
	{
		const { manager } = await _createMixedStore();

		const filtered = await manager.cookies.filter('mixed',
			cookie => isDomainInGroup(cookie.domain, 'solo.example.org'));

		t.assert.deepStrictEqual(
			(filtered?.payload ?? []).map(cookie => cookie.name),
			['solo'],
		);
	});

	test('分組鍵無需存在於資料：. 鍵仍收含整族子網域', async (t: TestContext) =>
	{
		const { manager } = await _createMixedStore();

		const filtered = await manager.cookies.filter('mixed',
			cookie => isDomainInGroup(cookie.domain, '.solo.example.org'));

		t.assert.deepStrictEqual(
			(filtered?.payload ?? []).map(cookie => cookie.name).sort(),
			['solo', 'solo_sub'],
		);
	});
});
