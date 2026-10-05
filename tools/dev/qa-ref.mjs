/*
 * Traces the Drawing Reference pipeline stage by stage, from the
 * reference token through sheet lookup, bounds and rendering, so a
 * failure is located rather than guessed at. Verification aid.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    /* Draw a line so the sheet definitely has content. */
    await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        const r = canvas.getBoundingClientRect();

        document
            .querySelector('[data-tool-id="line"]')
            ?.click();

        const clickAt = (dx, dy) => {
            const opts = {
                bubbles: true,
                cancelable: true,
                clientX: r.left + r.width * dx,
                clientY: r.top + r.height * dy,
                button: 0,
                detail: 1
            };

            [
                "pointermove",
                "mousemove",
                "pointerdown",
                "mousedown",
                "click",
                "pointerup",
                "mouseup"
            ].forEach((t) => {
                canvas.dispatchEvent(
                    new MouseEvent(t, opts)
                );
            });
        };

        clickAt(0.2, 0.2);
        clickAt(0.8, 0.8);
    });
    await page.waitForTimeout(600);

    return await page.evaluate(() => {
        const sheets = window.enggDrawingSheets;
        const ref = window.enggDrawingReference;

        const sheetId = sheets?.activeSheetId?.();
        const sheet = sheets?.sheetById?.(sheetId);

        const out = {
            hasSheets: Boolean(sheets),
            hasRef: Boolean(ref),
            sheetId,
            sheetName: sheet?.name,
            objectCount: sheet?.objects?.length,
            objectTypes:
                sheet?.objects?.map((o) => o.type) ??
                null
        };

        /* Stage 1: does renderReference find the sheet at all? */
        const rendered = ref?.renderDrawingReference?.(
            sheetId,
            { width: 900, height: 600 }
        );

        out.renderedOk = rendered?.ok;
        out.renderedEmpty = rendered?.empty;
        out.renderedReason = rendered?.reason;
        out.hasSvg = Boolean(rendered?.svg);
        out.svgChildCount =
            rendered?.svg?.childElementCount ?? null;

        return out;
    });
}
