/*
 * Drives the real Drawing Reference workflow: draw content, insert a
 * reference, render the written solution, and report what ended up
 * inside it. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);

    /* Draw a line on the active sheet. */
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

    /* The reference panel, and its controls. */
    const controls = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(
                "#drawingReferenceSheet, #drawingReferenceCaption, #drawingReferenceInsert, #drawingReferencePanel button, #drawingReferencePanel input, #drawingReferencePanel select"
            )
        ).map((el) => ({
            id: el.id || null,
            tag: el.tagName,
            text: (el.innerText || "").trim().slice(0, 40)
        }))
    );

    const staged = await page.evaluate(() => {
        const sheets = window.enggDrawingSheets;
        const ref = window.enggDrawingReference;
        const sheetId = sheets?.activeSheetId?.();
        const sheet = sheets?.sheetById?.(sheetId);

        const rendered = ref?.renderDrawingReference?.(
            sheetId,
            { width: 900, height: 600 }
        );

        return {
            sheetId,
            objectCount: sheet?.objects?.length,
            renderedOk: rendered?.ok,
            renderedEmpty: rendered?.empty,
            hasSvg: Boolean(rendered?.svg),
            svgKids: rendered?.svg?.childElementCount ?? null
        };
    });

    return { controls, staged };
}
