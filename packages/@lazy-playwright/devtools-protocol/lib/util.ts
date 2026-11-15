
import { CDPSession } from 'playwright';

export async function _tryDetachCDPSession(session: CDPSession)
{
	try
	{
		await session.detach();
	}
	catch
	{
	}
}
