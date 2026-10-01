/*
 * Follows the app's real load path and reports whether the drawing
 * globals appear on ANY window, which settles whether they are
 * missing or merely not where the probe was looking.
 */
export default async function run(page, ui) {
    const seen = [];

    page.on("framenavigated", (f) => {
        seen.push(f.url().slice(0, 120));
    });

    await page.goto("http://localhost:8931/index.html", {
        waitUntil: "load"
    });
    await page.waitForTimeout(3000);

    /* Click through every top-level tab, checking after each. */
    const snap = await ui.snapshot();

    const tabRefs = [...snap.matchAll(/@e(\d+) ([^\n]+)/g)]
        .map((m) => ({ ref: "@e" + m[1], text: m[2] }))
        .filter((t) =>
            /^(button|link|tab)?\s*(Datum|Engineering|Written|Submitted|Upload|Update)/i.test(
                t.text.trim()
            )
        )
        .slice(0, 6);

    const afterClicks = [];

    for (const t of tabRefs) {
        try {
            await ui.click(t.ref);
        } catch {
            continue;
        }
        await page.waitForTimeout(600);

        afterClicks.push({
            tab: t.text.trim().slice(0, 24),
            sheets: await page.evaluate(
                () => typeof window.enggDrawingSheets
            ),
            tools: await page.evaluate(
                () =>
                    document.querySelectorAll(
                        "[data-tool-id]"
                    ).length
            )
        });
    }

    return {
        navigations: seen,
        tabRefs: tabRefs.map((t) => t.text.trim().slice(0, 24)),
        afterClicks,
        finalGlobals: await page.evaluate(() => ({
            sheets: typeof window.enggDrawingSheets,
            state: typeof window.enggDrawingState,
            tools: typeof window.enggDrawingTools
        }))
    };
}
