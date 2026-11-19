
import { Camoufox, launchOptions } from 'camoufox';
import { firefox } from 'playwright-core';

const url = 'https://www.npmjs.com/search?q=author%3Abluelovers'

const main = async () =>
{
	const browser = await Camoufox({
		// custom camoufox options
	});

	// console.dir(browser.browser);

	const page = await browser.newPage(); // `page` is a Playwright Page instance
	await page.goto(url + '#main');

	console.dir(page.context().browser);

	// await browser.close();
}

const main2 = async () =>
{
	// you might need to run `npx camoufox-js fetch` to download the browser after installing the package

	const browser = await firefox.launch({
		...await launchOptions({ /* Camoufox options */ }),
		// other Playwright options, overriding the Camoufox options
	});

	const page = await browser.newPage(); // `page` is a Playwright Page instance
	await page.goto(url + '#main2');
}

// Promise.allSettled([
// 	main(),
// 	main2(),
// ]);

main2()
