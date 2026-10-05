/*
 * Whether the embedded reference tracks its sheet through an edit, a
 * rename and a reorder.
 *
 * Driven entirely through the UI. The app's globals read as
 * undefined from page.evaluate in this harness while the app
 * demonstrably works, so nothing here depends on them - a probe that
 * cannot be trusted should not decide a verdict.
 *
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.goto("http://localhost:8931/index.html", {
        waitUntil: "load"
    });
    await page.waitForTimeout(2500);

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];
    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(1200);
    }

    const draw = async (pairs) => {
        await page.evaluate((ps) => {
            const canvas = document.querySelector(
                ".drawing-canvas"
            );
            const r = canvas.getBoundingClientRect();

            const clickAt = (x, y) => {
                const o = {
                    bubbles: true, cancelable: true,
                    clientX: r.left + r.width * x,
                    clientY: r.top + r.height * y,
                    button: 0, detail: 1
                };
                ["pointermove", "mousemove", "pointerdown",
                 "mousedown", "click", "pointerup", "mouseup"]
                    .forEach((t) =>
                        canvas.dispatchEvent(
                            new MouseEvent(t, o)
                        )
                    );
            };

            ps.forEach(([a, b]) => {
                document
                    .querySelector('[data-tool-id="line"]')
                    ?.click();
                clickAt(a[0], a[1]);
                clickAt(b[0], b[1]);
            });
        }, pairs);
        await page.waitForTimeout(700);
    };

    const insert = () =>
        page.evaluate(() => {
            const code = document.getElementById("writingCode");
            const select = document.getElementById(
                "referenceSheetSelect"
            );
            const btn = document.getElementById(
                "referenceInsert"
            );

            code.value = "Diagram:\n\n\nEnd.";
            code.dispatchEvent(
                new Event("input", { bubbles: true })
            );
            if (select?.options?.length) {
                select.selectedIndex = 0;
            }
            btn.click();

            return {
                token:
                    code.value.match(
                        /\[DRAWING_REFERENCE:[^\]]+\]/
                    )?.[0] ?? null,
                /* The ID must be stable across every step. */
                sheetOptions: Array.from(
                    select?.options || []
                ).map((o) => o.value)
            };
        });

    const figure = () =>
        page.evaluate(() => {
            const frame = document.querySelector(
                ".drawing-reference-frame"
            );
            const fig = document.querySelector(
                ".drawing-reference-figure"
            );
            const text =
                document.getElementById("writingOutput")
                    ?.innerText || "";

            return {
                hasFigure: Boolean(fig),
                shapes: frame
                    ? frame.querySelectorAll(
                          "path,line,rect,circle,polygon,polyline"
                      ).length
                    : 0,
                caption:
                    fig?.querySelector("figcaption")
                        ?.textContent ?? null,
                saysEmpty: /this sheet is empty/i.test(text),
                saysCouldNot: /could not be drawn/i.test(text)
            };
        });

    const out = {};

    /* Draw one line and reference the sheet. */
    await draw([[[0.15, 0.15], [0.4, 0.4]]]);
    out.inserted = await insert();
    await page.waitForTimeout(1600);
    out.initial = await figure();

    /* EDIT the drawing: the figure must show the new content. */
    await draw([[[0.6, 0.6], [0.9, 0.78]]]);
    await page.waitForTimeout(1800);
    out.afterEdit = await figure();

    /* RENAME the sheet, through the sheet tab's own UI. */
    const rename = await page.evaluate(() => {
        const tabEl = document.querySelector(
            ".drawing-sheet-tab, [data-sheet-id]"
        );

        if (!tabEl) return "no sheet tab found";

        tabEl.dispatchEvent(
            new MouseEvent("dblclick", {
                bubbles: true,
                detail: 2
            })
        );

        return "double-clicked the sheet tab";
    });
    await page.waitForTimeout(700);

    const renamed = await page.evaluate(() => {
        const field = document.querySelector(
            ".drawing-sheet-rename input, " +
                "input[data-sheet-rename]"
        );

        if (!field) {
            return {
                fieldFound: false,
                note:
                    "no inline rename field appeared on " +
                    "double-click"
            };
        }

        field.value = "Free Body Diagram";
        field.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true
            })
        );

        return { fieldFound: true };
    });
    await page.waitForTimeout(1800);

    out.rename = { action: rename, ...renamed };
    out.afterRename = await figure();

    return out;
}
