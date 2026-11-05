import { IBrowserCtx } from '#/lib/bridge/types';

export interface ICreateNewPageOptions
{
	background?: boolean;
	waitForBringToFront?: boolean;
}

export async function createNewPage(ctx: IBrowserCtx, options?: ICreateNewPageOptions)
{
	let page = await ctx.context.newPage();

	if (options?.background && page !== ctx.page)
	{
		const p = ctx.page?.bringToFront();
		if (options?.waitForBringToFront)
		{
			await p;
		}
	}

	return page;
}
