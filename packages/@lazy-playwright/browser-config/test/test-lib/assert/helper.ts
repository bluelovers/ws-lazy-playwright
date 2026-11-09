import { TestContextAssert } from 'node:test';

export function _assertLazyPartialDeepStrictEqual<T>(assert: TestContextAssert, actual: readonly T[], expectedList: readonly (readonly NoInfer<T>[])[])
{
	for (const expected of expectedList)
	{
		assert.partialDeepStrictEqual(actual, expected);
	}
}
