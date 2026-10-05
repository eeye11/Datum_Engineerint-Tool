/*
 * Collapses each side panel and checks that the drawing area
 * actually grows, that the arrow survives, and that the zoom does
 * not move. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();

    const tab = snap.match(/@e\d+ [^\n]*Drawing[^\n]*/)?.[0];

    if (!tab) {
        return { error: "no drawing tab", snap };
    }

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(600);

    const read = () =>
        page.evaluate(() => {
            const canvas = document.querySelector(
                ".drawing-canvas"
            );

            return {
                canvasWidth: canvas?.clientWidth,
                zoom: document.getElementById(
                    "drawingZoomValue"
                )?.value,
                toolPanelVisible: !!document
                    .getElementById("drawingToolPanel")
                    ?.offsetParent,
                featuresPanelVisible:
                    !!document
                        .getElementById(
                            "drawingFeaturesPanel"
                        )?.offsetParent,
                leftToggleVisible: !!document
                    .getElementById(
                        "drawingToolPanelToggle"
                    )
                    ?.offsetParent,
                rightToggleVisible: !!document
                    .getElementById(
                        "drawingFeaturesPanelToggle"
                    )
                    ?.offsetParent
            };
        });

    const before = await read();

    /* Put the zoom somewhere distinctive first. */
    await page.evaluate(() => {
        const input = document.getElementById(
            "drawingZoomValue"
        );
        input.value = "150%";
        input.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true
            })
        );
    });
    await page.waitForTimeout(400);

    const atZoom = await read();

    await page.click("#drawingToolPanelToggle");
    await page.waitForTimeout(400);

    const leftCollapsed = await read();

    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(400);

    const bothCollapsed = await read();

    /* Reopen both. */
    await page.click("#drawingToolPanelToggle");
    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(400);

    const reopened = await read();

    return {
        before,
        atZoom,
        leftCollapsed,
        bothCollapsed,
        reopened
    };
}
