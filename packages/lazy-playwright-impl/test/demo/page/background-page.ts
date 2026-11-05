import { createBrowserAutomation } from '#/lib';

async function main()
{
	const automation = await createBrowserAutomation({

	});

	const context = await automation.newContext();

	await automation.gotoNewPage('https://example.com');

	await automation.gotoNewPage('https://playwright.dev/docs/pages', {
		background: true,
	});
}

main();
