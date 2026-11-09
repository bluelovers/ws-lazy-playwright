import { TestContextAssert } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import { inspect, isDeepStrictEqual, isPartialDeepStrictEqual } from 'node:util';

export interface IMatchByOrderOptions
{
	partialDeepStrictEqual?: boolean;
	not?: boolean;
}

export function _matchByOrder<T>(actual: readonly T[], expected: readonly NoInfer<T>[], options?: IMatchByOrderOptions)
{
	let index = 0;
	let bool = true;

	const fn = options?.partialDeepStrictEqual ? isPartialDeepStrictEqual : isDeepStrictEqual;

	for (const expectedValue of expected)
	{
		let current = actual[index];

		let found = false;

		while (index < actual.length)
		{
			found = fn(current, expectedValue);

			if (found)
			{
				bool = true;
				break;
			}
			else
			{
				bool = false;
			}

			index++;
			current = actual[index];
		}

		if (!found)
		{
			bool = false;
			break;
		}
	}

	return bool;
}

export function _assertMatchByOrderStrict<T>(assert: TestContextAssert, actual: readonly T[], expected: readonly NoInfer<T>[], options?: IMatchByOrderOptions)
{
	const result = _matchByOrder(actual, expected, options);

	let message = `${inspect(actual)}, Expected: ${inspect(expected)}`;

	if (options?.not)
	{
		assert.ok(!result, `Arrays match by order when they should not. ${message}`);
	}
	else
	{
		assert.ok(result, `Arrays do not match by order. ${message}`);
	}
}

