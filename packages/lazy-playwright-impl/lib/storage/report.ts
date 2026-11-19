import { millisecondsToSeconds, secondsToMilliseconds, tzDayjsSafeParse } from 'dayjs-tz-helper';
import { EnumStorageKind } from './types';
import type { IStoragePersist, IStorageRecord, ISessionState } from './types';

/** 人類可讀的日期時間格式 */
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/** 報告中的單一資料項目（cookie 或 origin） */
interface IReportItem
{
	/** 網域：cookie 取 domain，origin 取 hostname */
	domain: string;
	/** cookie 到期時間（epoch seconds）；origin 項目不提供 */
	expires?: number;
}

/** 網域分組的數量報告 */
export interface IDomainGroupReport
{
	/** 分組鍵：`.` 開頭的基底網域；無基底可依附時為該網域本身 */
	domain: string;
	/** 組內資料總數 */
	count: number;
	/** 組內各個別網域的資料數量 */
	domains: Record<string, number>;
	/** 組內 cookie 最早到期時間（人類可讀）；無有效到期時間時不提供 */
	expiresMinText?: string;
	/** 組內 cookie 最晚到期時間（人類可讀）；無有效到期時間時不提供 */
	expiresMaxText?: string;
}

/** 儲存紀錄的數量報告 */
export interface IStorageReport
{
	kind: EnumStorageKind;
	id: string;
	/** 更新時間（epoch milliseconds） */
	updatedAt: number;
	/** 更新時間（epoch seconds，與 cookie expires 同尺度） */
	updatedAtSeconds: number;
	/** 更新時間（人類可讀） */
	updatedAtText: string;
	/** cookie 數量 */
	cookies: number;
	/** origin 數量 */
	origins: number;
	/** 資料總數（cookie + origin） */
	total: number;
	/** 依網域分組的數量報告（依分組鍵排序） */
	groups: IDomainGroupReport[];
}

/** 更改前後的報告差異 */
export interface IStorageReportDiff
{
	/** 更改前報告；無既有紀錄（首次儲存）時不提供 */
	before?: IStorageReport;
	/** 更改後報告 */
	after: IStorageReport;
	/** 資料總數差異（更改後 - 更改前；首次儲存等同更改後總數） */
	total: number;
	/** 各分組的數量差異（僅列出非零項目） */
	groups: Record<string, number>;
}

/** 以人類可讀格式輸出時間戳 */
function _formatDate(milliseconds: number): string
{
	return tzDayjsSafeParse(milliseconds).format(DATE_FORMAT);
}

/** 取得 origin 的網域（hostname）；無法解析時以原始字串代替 */
function _originDomain(origin: string): string
{
	try
	{
		return new URL(origin).hostname || origin;
	}
	catch
	{
		return origin;
	}
}

/** 收集紀錄內所有屬於網域的資料項目與各類數量 */
function _collectItems(record: IStorageRecord): { items: IReportItem[]; cookies: number; origins: number }
{
	switch (record.kind)
	{
		case EnumStorageKind.Cookie:
		{
			const cookies = record.payload as ISessionState['cookies'];

			return {
				items: cookies.map(cookie => ({ domain: cookie.domain, expires: cookie.expires })),
				cookies: cookies.length,
				origins: 0,
			};
		}
		case EnumStorageKind.Session:
		{
			const payload = record.payload as ISessionState;

			return {
				items: [
					...payload.cookies.map(cookie => ({ domain: cookie.domain, expires: cookie.expires })),
					...payload.origins.map(origin => ({ domain: _originDomain(origin.origin) })),
				],
				cookies: payload.cookies.length,
				origins: payload.origins.length,
			};
		}
		default:
			return { items: [], cookies: 0, origins: 0 };
	}
}

/**
 * 依網域分組
 *
 * - 分組鍵為「無上層 `.` 基底」的 `.` 開頭網域（如 `.civitai.com`）
 * - `.` 開頭網域有所屬上層基底時併入該組（如 `.civitai.com` 存在時，`.advertising.civitai.com` 歸入 `.civitai.com`）
 * - 其餘網域歸入最長相符的基底組（如 `civitai.red` 歸入 `.civitai.red`）
 * - 找不到基底者自成一組
 */
function _buildGroups(items: readonly IReportItem[]): IDomainGroupReport[]
{
	const distinct = [...new Set(items.map(item => item.domain))];
	const dotDomains = distinct.filter(domain => domain.startsWith('.'));
	// 分組鍵：`.` 開頭且無上層 `.` 基底者；其餘 `.` 網域僅為組內成員
	const bases = dotDomains
		.filter(domain => !dotDomains.some(parent => parent !== domain && domain.endsWith(parent)))
		// 最長優先：讓 `x.y.example.com` 優先歸入 `.y.example.com` 而非 `.example.com`
		.sort((a, b) => b.length - a.length);

	const groups = new Map<string, {
		count: number;
		domains: Map<string, number>;
		expiresMin?: number;
		expiresMax?: number;
	}>();

	for (const item of items)
	{
		const key = bases.find(base => item.domain === base.slice(1) || item.domain.endsWith(base)) ?? item.domain;

		let group = groups.get(key);
		if (!group)
		{
			group = { count: 0, domains: new Map() };
			groups.set(key, group);
		}

		group.count++;
		group.domains.set(item.domain, (group.domains.get(item.domain) ?? 0) + 1);

		if (item.expires !== undefined && item.expires > 0)
		{
			const expires = secondsToMilliseconds(item.expires);

			group.expiresMin = group.expiresMin === undefined ? expires : Math.min(group.expiresMin, expires);
			group.expiresMax = group.expiresMax === undefined ? expires : Math.max(group.expiresMax, expires);
		}
	}

	return [...groups]
		.map(([domain, group]) =>
		{
			const report: IDomainGroupReport = {
				domain,
				count: group.count,
				domains: Object.fromEntries([...group.domains].sort((a, b) => a[0].localeCompare(b[0]))),
			};

			if (group.expiresMin !== undefined)
			{
				report.expiresMinText = _formatDate(group.expiresMin);
			}
			if (group.expiresMax !== undefined)
			{
				report.expiresMaxText = _formatDate(group.expiresMax);
			}

			return report;
		})
		.sort((a, b) => a.domain.localeCompare(b.domain));
}

/** 建立儲存紀錄的數量報告（含網域分組與人類可讀更新時間） */
export function createStorageReport(record: IStorageRecord): IStorageReport
{
	const { items, cookies, origins } = _collectItems(record);

	return {
		kind: record.kind,
		id: record.id,
		updatedAt: record.updatedAt,
		updatedAtSeconds: millisecondsToSeconds(record.updatedAt),
		updatedAtText: _formatDate(record.updatedAt),
		cookies,
		origins,
		total: cookies + origins,
		groups: _buildGroups(items),
	};
}

/** 比較更改前後的報告，產生總數與各分組的數量差異 */
export function diffStorageReport(before: IStorageReport | undefined, after: IStorageReport): IStorageReportDiff
{
	const beforeCounts = new Map<string, number>(before?.groups.map(group => [group.domain, group.count] as const));
	const afterCounts = new Map<string, number>(after.groups.map(group => [group.domain, group.count] as const));
	const groups: Record<string, number> = {};

	for (const [domain, count] of afterCounts)
	{
		const delta = count - (beforeCounts.get(domain) ?? 0);

		if (delta !== 0)
		{
			groups[domain] = delta;
		}
	}

	for (const [domain, count] of beforeCounts)
	{
		if (!afterCounts.has(domain))
		{
			groups[domain] = -count;
		}
	}

	return {
		before,
		after,
		total: after.total - (before?.total ?? 0),
		groups,
	};
}

/** 格式化數量差異（`+N` / `-N` / `0`） */
function _formatDelta(delta: number): string
{
	return delta > 0 ? `+${delta}` : `${delta}`;
}

/** 將單份報告轉換為 CLI 文字輸出（每組列出組內各別網域數量與到期區間） */
export function formatStorageReport(report: IStorageReport): string
{
	const lines = [
		`[${report.kind}] ${report.id} @ ${report.updatedAtText}`,
		`total ${report.total} (cookies ${report.cookies}, origins ${report.origins})`,
	];

	if (!report.groups.length)
	{
		lines.push('groups: none');
		return lines.join('\n');
	}

	lines.push(`groups ${report.groups.length}:`);

	for (const group of report.groups)
	{
		const expires = group.expiresMinText && group.expiresMaxText
			? ` [expires ${group.expiresMinText} ~ ${group.expiresMaxText}]`
			: '';

		lines.push(`  ${group.domain}: ${group.count}${expires}`);

		for (const [domain, count] of Object.entries(group.domains))
		{
			lines.push(`    ${domain}: ${count}`);
		}
	}

	return lines.join('\n');
}

/** 將更改前後差異轉換為 CLI 文字輸出（僅列出有變動的分組） */
export function formatStorageReportDiff(diff: IStorageReportDiff): string
{
	const { before, after } = diff;
	const lines = [
		`[${after.kind}] ${after.id}`,
		before
			? `updatedAt: ${before.updatedAtText} -> ${after.updatedAtText}`
			: `updatedAt: ${after.updatedAtText}`,
		`total: ${before?.total ?? 0} -> ${after.total} (${_formatDelta(diff.total)})`,
	];

	const beforeCounts = new Map<string, number>(before?.groups.map(group => [group.domain, group.count] as const));
	const changed = Object.entries(diff.groups).sort(([a], [b]) => a.localeCompare(b));

	if (!changed.length)
	{
		lines.push('groups: no change');
		return lines.join('\n');
	}

	lines.push('groups:');

	for (const [domain, delta] of changed)
	{
		const prev = beforeCounts.get(domain) ?? 0;

		lines.push(`  ${domain}: ${prev} -> ${prev + delta} (${_formatDelta(delta)})`);
	}

	return lines.join('\n');
}

/** 讀取既有紀錄並建立報告；尚無紀錄時回傳 undefined */
export async function readStorageReport(persist: IStoragePersist, kind: EnumStorageKind, id: string): Promise<IStorageReport | undefined>
{
	const record = await persist.read(kind, id);

	return record ? createStorageReport(record) : undefined;
}
