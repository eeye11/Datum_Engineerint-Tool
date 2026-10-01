/*
 * The decisive end-to-end check: draw content, insert a reference
 * through the real controls, and read what is in the solution.
 * Verification aid.
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

    /* Draw a line, using whatever the UI currently offers. */
    const drew = await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        if (!canvas) return "no canvas";

        const r = canvas.getBoundingClientRect();
        const o = {
            bubbles: true, cancelable: true,
            clientX: r.left + r.width * 0.2,
            clientY: r.top + r.height * 0.2,
            button: 0, detail: 1
        };

        /* Find and press the Line tool, whatever attribute it has. */
        const line =
            document.querySelector('[data-tool-id="line"]');
        line?.click();

        const clickAt = (x, y) => {
            const e = {
                ...o,
                clientX: r.left + r.width * x,
                clientY: r.top + r.height * y
            };
            ["pointermove", "mousemove", "pointerdown",
             "mousedown", "click", "pointerup", "mouseup"]
                .forEach((t) =>
                    canvas.dispatchEvent(
                        new MouseEvent(t, e)
                    )
                );
        };

        clickAt(0.2, 0.2);
        clickAt(0.8, 0.8);

        return {
            lineToolFound: Boolean(line),
            message:
                document.getElementById("drawingToolMessage")
                    ?.innerText
        };
    });
    await page.waitForTimeout(800);

    /* Insert the reference. */
    const inserted = await page.evaluate(() => {
        const code = document.getElementById("writingCode");
        const select = document.getElementById(
            "referenceSheetSelect"
        );
        const insert = document.getElementById(
            "referenceInsert"
        );

        if (!code || !insert) {
            return { error: "no controls" };
        }

        code.value = "The diagram is:\n\n\nTherefore.";
        code.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        if (select?.options?.length) {
            select.selectedIndex = 0;
        }

        insert.click();

        return {
            selectOptions: select?.options?.length ?? 0,
            codeValue: code.value.slice(0, 120)
        };
    });
    await page.waitForTimeout(2000);

    /* Read the rendered solution. */
    const rendered = await page.evaluate(() => {
        const output =
            document.getElementById("writingOutput");
        if (!output) return { error: "no output" };

        const text = output.innerText || "";
        const frame = output.querySelector(
            ".drawing-reference-frame"
        );

        return {
            figureCount: output.querySelectorAll(
                ".drawing-reference-figure"
            ).length,
            frameCount: output.querySelectorAll(
                ".drawing-reference-frame"
            ).length,
            shapesInside: frame
                ? frame.querySelectorAll(
                      "path,line,rect,circle,polygon,polyline"
                  ).length
                : 0,
            saysEmpty: /this sheet is empty/i.test(text),
            saysMissing: /no longer in this document/i.test(
                text
            ),
            saysCouldNot: /could not be drawn/i.test(text),
            outputHtmlLength: output.innerHTML.length,
            text: text.slice(0, 200)
        };
    });

    return { drew, inserted, rendered };
}
