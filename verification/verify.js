const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        recordVideo: { dir: './verification/videos' }
    });
    const page = await context.newPage();

    try {
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(500);

        // Wait for the scripts to execute and populate the hrefs
        await page.waitForFunction(() => {
            const cal = document.getElementById('bm-walmart-calendar');
            return cal && cal.getAttribute('href') !== '#';
        }, { timeout: 5000 });
        await page.waitForTimeout(500);

        // Take a screenshot of the main page where the links should be ready
        await page.screenshot({ path: './verification/screenshots/verification.png' });
        await page.waitForTimeout(1000); // Hold final state for the video
    } finally {
        await context.close();
        await browser.close();
    }
})();
