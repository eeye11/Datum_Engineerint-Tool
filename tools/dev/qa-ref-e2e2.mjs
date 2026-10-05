/*
 * The Drawing Reference acceptance flow, waiting for the application
 * to actually mount before drawing. Verification aid, not part of the
 * application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    /*
     * Wait for the drawing module rather than a fixed delay. The
     * scripts are numerous and the reference cannot be tested until
     * the API it uses exists.
     */
    const mounted = await page
        .waitForFunction(
            () =>
                typeof window.enggDrawingSheets !==
                    "undefined" &&
                typeof window.enggDrawingReference !==
                    "undefined",
            { timeout: 30000 }
        )
        .then(() => true)
        .catch(() => false);

    if (!mounted) {
        return { error: "drawing module never mounted" };
    }

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(700);
    }

    const out = { mounted };

    /* ---- Draw several objects on Sheet 1. ---- */
    await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        const r = canvas.getBoundingClientRect();

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

        const use = (id) =>
            document
                .querySelector(`[data-tool-id="${id}"]`)
                ?.click();

        use("line");
        clickAt(0.12, 0.12);
        clickAt(0.4, 0.4);

        use("rectangle");
        clickAt(0.5, 0.12);
        clickAt(0.8, 0.35);

        use("circle");
        clickAt(0.7, 0.7);
        clickAt(0.5, 0.7);
    });
    await page.waitForTimeout(700);

    out.sheet = await page.evaluate(() => {
        const s = window.enggDrawingSheets;
        const sheet = s.sheetById(s.activeSheetId());

        return {
            count: sheet?.objects?.length,
            types: sheet?.objects?.map((o) => o.type)
        };
    });

    /* ---- Insert a reference into the written solution. ---- */
    out.insert = await page.evaluate(() => {
        const editor =
            document.getElementById("writingInput");
        const select =
            document.getElementById("referenceSheetSelect");
        const caption =
            document.getElementById("referenceCaption");
        const insert =
            document.getElementById("referenceInsert");

        if (!editor || !insert) {
            return {
                error: "missing controls",
                editor: Boolean(editor),
                insert: Boolean(insert)
            };
        }

        editor.value =
            "The free-body diagram is:\n\n\nTherefore, the reactions follow.";

        if (select?.options?.length) {
            select.selectedIndex = 0;
        }

        if (caption) {
            caption.value = "";
        }

        insert.click();

        return {
            sourceAfter:
                editor.value.slice(0, 200),
            hasToken: /DRAWING_REFERENCE/.test(
                editor.value
            )
        };
    });
    await page.waitForTimeout(1200);

    /* ---- What is inside the rendered solution? ---- */
    out.output = await page.evaluate(() => {
        const output =
            document.getElementById("writingOutput");

        if (!output) {
            return { error: "no output" };
        }

        const text = output.innerText || "";

        return {
            hasFigure: Boolean(
                output.querySelector(
                    ".drawing-reference-figure"
                )
            ),
            hasFrame: Boolean(
                output.querySelector(
                    ".drawing-reference-frame"
                )
            ),
            svgCount: output.querySelectorAll("svg").length,
            shapeCount: output.querySelectorAll(
                "path, line, rect, circle, polygon, polyline"
            ).length,
            saysEmpty: /this sheet is empty/i.test(text),
            saysMissing: /no longer in this document/i.test(
                text
            ),
            saysCouldNot: /could not be drawn/i.test(text),
            text: text.slice(0, 260)
        };
    });

    return out;
}
