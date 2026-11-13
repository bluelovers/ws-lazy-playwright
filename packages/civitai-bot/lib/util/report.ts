import { basename, relative } from 'upath2';
import { _logPhase, _logPhaseData, _withBatch } from './logger';
import { EnumPostPhase, EnumUploadKind, type IMessageOptions, type IRunContext } from '../types/types';
import { classify, GRID_PREFIX, XYZ_GRID_PREFIX } from '../scan-collect/upload-order';

/**
 * 以上傳階段名義以終端輸出報告單一批次
 *
 * 輸出批次序號、各類型數量與批次的起始 / 結束檔案（批次邊界，空批次略過邊界）；
 * 起始 / 結束檔案取自執行期 context 的任務基準路徑（`ctx.taskBase`），
 * 有基準路徑時以 {@link relative} 簡化為相對路徑。
 *
 * @param ctx 執行期 context（{@link IRunContext}）：提供訊息控制 `options` 與任務基準路徑 `taskBase`
 */
export function reportBatch(batchNo: number, files: readonly string[], note: string, ctx?: IRunContext): void
{
	const options = ctx?.options;
	const { taskBase } = ctx ?? {};
	const message: IMessageOptions = _withBatch(options, batchNo);

	const counts = new Map<EnumUploadKind, number>(Object.values(EnumUploadKind).map(kind => [kind, 0]));

	for (const file of files)
	{
		const kind = classify(basename(file));
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}

	/** 批次邊界路徑：有任務基準路徑時以 {@link relative} 簡化，否則維持原路徑 */
	const boundaryPath = (file: string) => taskBase ? relative(taskBase, file) : file;

	_logPhase(
		EnumPostPhase.Upload,
		message,
		`[${note}]`
		+ ` ${XYZ_GRID_PREFIX}: ${counts.get(EnumUploadKind.XyzGrid)}`
		+ `, ${GRID_PREFIX}: ${counts.get(EnumUploadKind.Grid)}`
		+ `, others: ${counts.get(EnumUploadKind.Other)}`
		+ `, total: ${files.length}`
	);
	files.length && _logPhaseData(
		message,
		{
			start: boundaryPath(files[0]),
			end: files.length > 1 ? boundaryPath(files[files.length - 1]) : undefined,
		},
	);
}
