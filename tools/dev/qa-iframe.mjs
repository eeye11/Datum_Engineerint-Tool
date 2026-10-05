/*
 * Checks whether the drawing app lives in an iframe, which would
 * explain globals being absent from the top window while the page
 * plainly contains the UI.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
        const frames = Array.from(
            document.querySelectorAll("iframe")
        ).map((f) => ({
            id: f.id,
            name: f.name,
            src: f.getAttribute("src"),
            sameOrigin: (() => {
                try {
                    return Boolean(
                        f.contentDocument
                    );
                } catch {
                    return false;
                }
            })()
        }));

        return {
            frameCount: frames.length,
            frames,
            windowIsTop: window === window.top,
            topGlobals: {
                sheets: typeof window.enggDrawingSheets
            }
        };
    });
}
