/*
 * Reports when the drawing module's API becomes available, so a
 * missing global can be told apart from a slow mount. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 20000 });

    const before = await page.evaluate(() => ({
        sheets: typeof window.enggDrawingSheets,
        ref: typeof window.enggDrawingReference,
        written: typeof window.enggDrawingWrittenReferences,
        ready: document.readyState
    }));

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(1500);
    }

    const after = await page.evaluate(() => ({
        sheets: typeof window.enggDrawingSheets,
        ref: typeof window.enggDrawingReference,
        written: typeof window.enggDrawingWrittenReferences,
        tab: document.querySelector("#drawing")
            ?.className,
        canvas: Boolean(
            document.querySelector(".drawing-canvas")
        )
    }));

    /* Any script that failed to run leaves a global undefined, so
       report which of the module files loaded at all. */
    const scripts = await page.evaluate(() =>
        Array.from(document.scripts)
            .map((s) => s.src.split("/").pop())
            .filter(Boolean)
    );

    return { before, after, scriptCount: scripts.length };
}
