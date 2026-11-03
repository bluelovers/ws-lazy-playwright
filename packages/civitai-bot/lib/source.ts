import { toTaskFolder } from './folder';
import { _logPhase } from './logger';
import {
	EnumPostPhase,
	type IFolderInput,
	type IFolderInputEntry,
	type IFolderInputObject,
	type IMessageOptions,
	type ITaskFolder,
} from './types';

function _isThenable(value: unknown): value is PromiseLike<unknown>
{
	return typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function';
}

function _isAsyncIterable(value: unknown): value is AsyncIterable<unknown>
{
	return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

function _isIterable(value: unknown): value is Iterable<unknown>
{
	return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

function _isFolderInputObject(value: unknown): value is IFolderInputObject
{
	return typeof value === 'object' && value !== null && typeof (value as IFolderInputObject).path === 'string';
}

/**
 * 完整階段：解析來源輸入為標準資料夾清單（供 `for...of` 逐一執行）
 *
 * 支援模式：單一字串 / 物件、`Iterable<string|object>`、同步 Generator、
 * `globStream`（AsyncIterable）、`globAsync`（Promise）、
 * 構建函式 `() => 以上任一`（可逐層展開）。
 *
 * 非同步來源（globStream / Promise）需先取完 —— 同步 `for...of` 無法等待非同步。
 */
export async function resolveFolderInput(input: IFolderInput, options?: IMessageOptions): Promise<ITaskFolder[]>
{
	/** 構建函式可逐層展開 */
	let value: unknown = input;

	while (typeof value === 'function')
	{
		value = (value as () => IFolderInput)();
	}

	/** Promise（globAsync）：等待後重新判斷型態 */
	while (_isThenable(value))
	{
		value = await value;
	}

	const entries: IFolderInputEntry[] = [];

	if (typeof value === 'string')
	{
		entries.push(value);
	}
	else if (_isAsyncIterable(value))
	{
		/** globStream：先取完再交由 for-of 執行 */
		for await (const entry of value as AsyncIterable<IFolderInputEntry>)
		{
			entries.push(entry);
		}
	}
	else if (_isIterable(value))
	{
		for (const entry of value as Iterable<IFolderInputEntry>)
		{
			entries.push(entry);
		}
	}
	else if (_isFolderInputObject(value))
	{
		entries.push(value);
	}
	else
	{
		_logPhase(EnumPostPhase.AutoPost, options, `unsupported source input: ${String(value)}`);
		return [];
	}

	const folders = entries.map(entry => toTaskFolder(entry));

	_logPhase(EnumPostPhase.AutoPost, options, `source resolved: ${folders.length} folders`);

	return folders;
}
