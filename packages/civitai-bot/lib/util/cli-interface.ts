import { createInterface } from 'node:readline/promises';

/** 以標準輸入讀取一行（去空白、小寫）；用於 y/n 確認 */
export async function _ask(question: string): Promise<string>
{
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	try
	{
		return (await rl.question(question)).trim().toLowerCase();
	}

	finally
	{
		rl.close();
	}
}
