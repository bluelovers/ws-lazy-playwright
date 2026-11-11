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

export interface IIterateFolderInputOptions
{
	messageOptions?: IMessageOptions;
	noThrowOnError?: boolean;
}

/**
 * 完整階段：以生成器 (Generator) 逐項解析來源輸入為標準資料夾物件
 *
 * 支援模式：單一字串 / 物件、`Iterable<string|object>`、同步 Generator、
 * `globStream`（AsyncIterable）、`globAsync`（Promise）、
 * 構建函式 `() => 以上任一`（可逐層展開）。
 *
 * 單次遍歷 (Single Pass)：解析一項即產出一項，不建立中間陣列 (Intermediate Array)，
 * 由呼叫端以 `for await` 逐項消費；非同步來源在迭代當下才被取用。
 */
export async function* iterateFolderInput(input: IFolderInput, options?: IIterateFolderInputOptions): AsyncGenerator<ITaskFolder>
{
	/** 構建函式可逐層展開 */
	let value: unknown = input;

	if (typeof value === 'function')
	{
		value = (value as () => IFolderInput)();
	}

	/** Promise（globAsync）：等待後重新判斷型態 */
	while (_isThenable(value))
	{
		value = await value;
	}

	if (typeof value === 'string')
	{
		yield toTaskFolder(value);
	}
	else if (_isAsyncIterable(value))
	{
		/** globStream：逐項取用 AsyncIterable 後轉換產出 */
		for await (const entry of value as AsyncIterable<IFolderInputEntry>)
		{
			yield toTaskFolder(entry);
		}
	}
	else if (_isIterable(value))
	{
		for (const entry of value as Iterable<IFolderInputEntry>)
		{
			yield toTaskFolder(entry);
		}
	}
	else if (_isFolderInputObject(value))
	{
		yield toTaskFolder(value);
	}
	else
	{
		_logPhase(EnumPostPhase.AutoPost, options?.messageOptions, `unsupported source input: ${String(value)}`);
		if (!options?.noThrowOnError)
		{
			throw new TypeError(`unsupported source input: ${value}`);
		}
	}
}

/**
 * 完整階段：物化 {@link iterateFolderInput} 為標準資料夾清單（供需要長度或陣列 API 的呼叫端使用）
 *
 * 以單次遍歷 (Single Pass) 消費來源串流後回傳。
 */
export async function resolveFolderInput(input: IFolderInput, messageOptions?: IMessageOptions): Promise<ITaskFolder[]>
{
	const folders: ITaskFolder[] = [];

	for await (const folder of iterateFolderInput(input, {
		messageOptions: messageOptions,
	}))
	{
		folders.push(folder);
	}

	_logPhase(EnumPostPhase.AutoPost, messageOptions, `source resolved: ${folders.length} folders`);

	return folders;
}

/**
 * 將已探測的首項接回資料夾串流 (Folder Stream)
 *
 * 呼叫端可先以 `next()` 探測首項（判定空清單、提前中止），
 * 再以單一 `for await` 消費首項與其後串流，避免為判斷空否而遍歷兩次。
 */
export async function* prependFolder(first: ITaskFolder, rest: AsyncIterable<ITaskFolder>): AsyncGenerator<ITaskFolder>
{
	yield first;
	yield* rest;
}
