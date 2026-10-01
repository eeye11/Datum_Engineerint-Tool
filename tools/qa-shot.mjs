/*
 * Screenshots the drawing area with the left panel collapsed, to
 * check the arrow strip reads clearly. Verification aid, not part
 * of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(/@e\d+ [^\n]*Drawing[^\n]*/)?.[0];

    if (!tab) {
        return { error: "no drawing tab", snap };
    }

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(600);

    await page.click("#drawingToolPanelToggle");
    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(500);

    return {
        collapsed: true,
        note: "screenshot written by the runner"
    };
}
