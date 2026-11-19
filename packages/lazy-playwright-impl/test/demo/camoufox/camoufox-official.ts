

import { newCamoufox, newCamoufoxContext } from '@lazy-playwright/camoufox-npm';
import { NewContext } from 'camoufox';
import { firefox } from 'playwright';

const url = 'https://www.npmjs.com/search?q=author%3Abluelovers'

const main = async () =>
{
	const browser = await newCamoufox({
		// custom camoufox options
	});

	browser.on('context', (context) => {
		console.log('new context');
	});

	console.dir({
		// @ts-ignore
		browser: browser.browser,
		context: browser.contexts,
	});

	const page = await browser.newPage(); // `page` is a Playwright Page instance
	await page.goto(url + '#main');

	console.dir({
		// @ts-ignore
		browser_match: browser === page.context().browser,
		// @ts-ignore
		['page.context.browser']: page.context().browser,
		context: page.context() === browser.contexts()[0],
		// @ts-ignore
		browser_equal_context: browser === page.context(),
	});

	const page3 = await browser.newPage();
	await page3.goto(url + '#main3');

	// 會拋拋出錯誤
	// const page4 = await browser.contexts()[0].newPage();
	// await page4.goto(url + '#main4');

	const context = await newCamoufoxContext(browser);

	const page2 = await context.newPage(); // `page` is a Playwright Page instance
	await page2.goto(url + '#main3');

	console.dir({
		// @ts-ignore
		browser_match: browser === context.browser(),
		// @ts-ignore
		browser: context.browser,
		['page2.context.browser']: page2.context().browser,
		context: page2.context() === browser.contexts()[1],
	});

	const page5 = await context.newPage();
	await page5.goto(url + '#main5');

	// await browser.close();
}

main()
