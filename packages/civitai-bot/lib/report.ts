import { basename } from 'node:path';
import { _logPhase } from './logger';
import { EnumPostPhase, EnumUploadKind, type IMessageOptions } from './types';
import { classify } from './upload-order';

/** 依總大小貪心切包：單次上傳總和不超過 `maxBytes`
 *
 * 單檔即超過上限時仍自成一包（檔案無法再拆分）。
 */
export function packBySize<T extends { size: number }>(items: readonly T[], maxBytes: number): T[][]
{
	const packs: T[][] = [];
	let current: T[] = [];
	let currentSize = 0;

	for (const item of items)
	{
		if (current.length && currentSize + item.size > maxBytes)
		{
			packs.push(current);
			current = [];
			currentSize = 0;
		}

		current.push(item);
		currentSize += item.size;
	}

	if (current.length) packs.push(current);

	return packs;
}

/**
 * 以上傳階段名義以終端輸出報告單一批次
 *
 * 輸出批次序號、各類型數量與批次的起始 / 結束檔案（批次邊界，空批次略過邊界）。
 */
export function reportBatch(batchNo: number, files: readonly string[], note: string, options?: IMessageOptions): void
{
	const counts = new Map<EnumUploadKind, number>([
		[EnumUploadKind.XyzGrid, 0],
		[EnumUploadKind.Grid, 0],
		[EnumUploadKind.Other, 0],
	]);

	for (const file of files)
	{
		const kind = classify(basename(file));
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}

	/** 批次邊界：起始與結束檔案（單檔批次兩者相同） */
	const boundary = files.length
		? `起始: ${files[0]}, 結束: ${files[files.length - 1]}`
		: '';

	_logPhase(
		EnumPostPhase.Upload,
		{ ...options, batchNo },
		`[${note}]`
		+ ` xyz_grid-: ${counts.get(EnumUploadKind.XyzGrid)}`
		+ `, grid-: ${counts.get(EnumUploadKind.Grid)}`
		+ `, 其他: ${counts.get(EnumUploadKind.Other)}`
		+ `, total: ${files.length}`
	);
	boundary && _logPhase(
		EnumPostPhase.Upload,
		{ ...options, batchNo },
		`[${note}]`
		+ boundary,
	);
}
