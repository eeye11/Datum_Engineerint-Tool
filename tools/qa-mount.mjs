/*
 * Waits for the page to finish loading before reporting, so a slow
 * mount is not mistaken for a broken one. Verification aid.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", {
        timeout: 20000
    });

    const mounted = await page
        .waitForFunction(
            () =>
                typeof window.enggDrawingSheets !==
                    "undefined",
            { timeout: 20000 }
        )
        .then(() => true)
        .catch(() => false);

    return {
        mounted,
        readyState: await page.evaluate(
            () => document.readyState
        ),
        hasSheets: await page.evaluate(
            () =>
                typeof window.enggDrawingSheets
        ),
        hasRef: await page.evaluate(
            () =>
                typeof window.enggDrawingReference
        ),
        hasState: await page.evaluate(
            () => typeof window.enggDrawing
        )
    };
}
