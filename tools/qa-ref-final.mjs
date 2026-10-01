/*
 * The Drawing Reference acceptance flow from requirement 47, driven
 * through the real controls.
 *
 * The controls are `writingCode` (the source), `referenceSheetSelect`,
 * `referenceCaption`, `referenceInsert` and `writingOutput` - the
 * editor, not an "input", which is what an earlier probe assumed and
 * why it found nothing to drive.
 *
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    await page
        .waitForFunction(
            () =>
                typeof window.enggDrawingSheets !==
                    "undefined",
            { timeout: 30000 }
        )
        .catch(() => null);

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(900);
    }

    const out = {};

    /* --- 2-6. Draw content on Sheet 1 --- */

    out.controls = await page.evaluate(() => ({
        code: Boolean(
            document.getElementById("writingCode")
        ),
        output: Boolean(
            document.getElementById("writingOutput")
        ),
        select: Boolean(
            document.getElementById("referenceSheetSelect")
        ),
        insert: Boolean(
            document.getElementById("referenceInsert")
        )
    }));

    await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        const r = canvas.getBoundingClientRect();

        const clickAt = (dx, dy) => {
            const o = {
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
            ].forEach((t) =>
                canvas.dispatchEvent(new MouseEvent(t, o))
            );
        };

        const use = (id) =>
            document
                .querySelector(`[data-tool-id="${id}"]`)
                ?.click();

        const cat = (c) =>
            document
                .querySelector(
                    `.drawing-category[data-category="${c}"]`
                )
                ?.click();

        cat("GEOMETRY");
        use("line");
        clickAt(0.15, 0.15);
        clickAt(0.45, 0.45);

        cat("GEOMETRY");
        use("rectangle");
        clickAt(0.55, 0.15);
        clickAt(0.85, 0.4);

        cat("GEOMETRY");
        use("circle");
        clickAt(0.7, 0.75);
        clickAt(0.5, 0.75);
    });

    /* The category switch re-renders, so arm the last tool again. */
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        const r = canvas.getBoundingClientRect();
        const o = {
            bubbles: true,
            cancelable: true,
            clientX: r.left + r.width * 0.5,
            clientY: r.top + r.height * 0.75,
            button: 0,
            detail: 1
        };
        document
            .querySelector('[data-tool-id="circle"]')
            ?.click();
        [
            "pointermove", "mousemove", "pointerdown",
            "mousedown", "click", "pointerup", "mouseup"
        ].forEach((t) =>
            canvas.dispatchEvent(new MouseEvent(t, o))
        );
    });
    await page.waitForTimeout(700);

    out.sheet = await page.evaluate(() => {
        const s = window.enggDrawingSheets;
        const sheet = s.sheetById(s.activeSheetId());

        return {
            id: s.activeSheetId(),
            name: sheet?.name,
            count: sheet?.objects?.length,
            types: sheet?.objects?.map((o) => o.type)
        };
    });

    /* --- 7. Insert a Drawing Reference --- */

    out.insert = await page.evaluate(() => {
        const code = document.getElementById("writingCode");
        const select = document.getElementById(
            "referenceSheetSelect"
        );
        const caption = document.getElementById(
            "referenceCaption"
        );
        const insert = document.getElementById(
            "referenceInsert"
        );

        if (!code || !insert) {
            return { error: "missing controls" };
        }

        code.value =
            "The free-body diagram is:\n\n\n" +
            "Therefore the reactions follow.";

        if (select?.options?.length) {
            select.selectedIndex = 0;
        }

        if (caption) {
            caption.value = "";
        }

        insert.click();

        return {
            options: select?.options?.length ?? 0,
            selected: select?.value,
            hasToken: /DRAWING_REFERENCE/.test(code.value)
        };
    });

    await page.waitForTimeout(1400);

    /* --- 8-13. What ended up in the rendered solution --- */

    out.rendered = await page.evaluate(() => {
        const output =
            document.getElementById("writingOutput");

        if (!output) {
            return { error: "no output" };
        }

        const text = output.innerText || "";
        const figures = output.querySelectorAll(
            ".drawing-reference-figure"
        );
        const frames = output.querySelectorAll(
            ".drawing-reference-frame"
        );

        /* What is actually INSIDE the first frame. */
        const shapes = frames[0]
            ? frames[0].querySelectorAll(
                  "path,line,rect,circle,polygon,polyline"
              ).length
            : 0;

        return {
            figures: figures.length,
            frames: frames.length,
            embeddedSvg: frames[0]
                ? frames[0].querySelectorAll("svg").length
                : 0,
            shapesInsideFrame: shapes,
            totalSvgs: output.querySelectorAll("svg").length,
            saysEmpty: /this sheet is empty/i.test(text),
            saysMissing: /no longer in this document/i.test(
                text
            ),
            saysCouldNot: /could not be drawn/i.test(text),
            text: text.slice(0, 220)
        };
    });

    /* Did anything open in a new tab or replace the page? */
    out.noNavigation = {
        url: await page.evaluate(() => location.href),
        stillHasApp: await page.evaluate(
            () =>
                typeof window.enggDrawingSheets !==
                "undefined"
        )
    };

    return out;
}
