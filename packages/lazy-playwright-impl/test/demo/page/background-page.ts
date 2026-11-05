import { createBrowserAutomation } from '#/lib';

async function main()
{
	const automation = await createBrowserAutomation({

	});

	const context = await automation.newContext();

	await automation.gotoNewPage('https://example.com');

	let result = await automation.gotoNewPage('https://playwright.dev/docs/pages', {
		background: true,
		checkMatch: true,
	});

	console.dir({
		...result,
		page: result.page?.url(),
	}, { depth: null });

	result = await automation.goto('https://playwright.dev/docs/pages', {
		page: result.page,
		checkMatch: true,
	});

	console.dir({
		...result,
		page: result.page?.url(),
	}, { depth: null });

	await automation.close();
}

main();
