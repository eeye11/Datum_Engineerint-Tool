/*
 * The remaining acceptance steps: the reference must track the sheet
 * as it is EDITED, RENAMED and REORDERED, because it points at a
 * stable ID rather than a name or a position.
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

    const insert = async () =>
        page.evaluate(() => {
            const code = document.getElementById("writingCode");
            const select = document.getElementById(
                "referenceSheetSelect"
            );
            const insertBtn = document.getElementById(
                "referenceInsert"
            );

            code.value = "Diagram:\n\n\nEnd.";
            code.dispatchEvent(
                new Event("input", { bubbles: true })
            );
            if (select?.options?.length) {
                select.selectedIndex = 0;
            }
            insertBtn.click();
            return code.value.match(
                /\[DRAWING_REFERENCE:[^\]]+\]/)?.[0] ?? null;
        });

    const readFigure = () =>
        page.evaluate(() => {
            const frame = document.querySelector(
                ".drawing-reference-frame"
            );
            const text =
                document.getElementById("writingOutput")
                    ?.innerText || "";
            return {
                shapes: frame
                    ? frame.querySelectorAll(
                          "path,line,rect,circle,polygon,polyline"
                      ).length
                    : 0,
                caption: frame
                    ?.closest(".drawing-reference-figure")
                    ?.querySelector("figcaption")
                    ?.textContent ?? null,
                saysEmpty: /this sheet is empty/i.test(text)
            };
        });

    const out = {};

    /* Two lines, then a reference to it. */
    await draw([[[0.15, 0.15], [0.4, 0.4]]]);
    out.token = await insert();
    await page.waitForTimeout(1500);
    out.initial = await readFigure();

    /* 14-16. Edit the drawing: the figure must follow. */
    await draw([[[0.6, 0.6], [0.9, 0.75]]]);
    await page.waitForTimeout(1500);
    out.afterEdit = await readFigure();

    /* 17-18. Rename the sheet: the reference must still resolve. */
    const renamed = await page.evaluate(() => {
        const sheets = window.enggDrawingSheets;
        const id = sheets.activeSheetId();

        /* Rename through the app's own API, as the UI does. */
        const ok = sheets.renameSheet
            ? Boolean(sheets.renameSheet(id, "Free Body Diagram"))
            : null;

        return { id, ok, name: sheets.sheetById(id)?.name };
    });
    await page.waitForTimeout(1600);
    out.rename = { ...renamed, figure: await readFigure() };

    /* 19-21. Reorder: the reference must still resolve. */
    const reordered = await page.evaluate(() => {
        const sheets = window.enggDrawingSheets;
        const all = sheets.all();
        if (all.length < 2) return "only one sheet";

        sheets.createSheet("Scratch");
        const list = sheets.all();
        const moved = sheets.moveSheet
            ? sheets.moveSheet(
                  list[0].id,
                  list[list.length - 1].id
              )
            : null;

        return {
            order: sheets.all().map((s) => s.name)
        };
    });
    await page.waitForTimeout(1600);
    out.reorder = {
        result: reordered,
        figure: await readFigure()
    };

    return out;
}
