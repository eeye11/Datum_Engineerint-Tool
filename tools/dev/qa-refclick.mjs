/*
 * Clicks the canvas through the ref helper - the same mechanism
 * that works for the other UI checks - to establish whether canvas
 * input reaches the app at all. Verification aid.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    /* Choose the Line tool by ref. */
    const afterTab = await ui.snapshot();
    const lineRef = afterTab.match(
        /@e\d+ [^\n]*\bLine\b[^\n]*/
    )?.[0];

    if (!lineRef) {
        return {
            error: "no Line tool",
            snap: afterTab.slice(0, 2000)
        };
    }

    await ui.click(lineRef.match(/@e\d+/)[0]);
    await page.waitForTimeout(300);

    const msg = () =>
        page.evaluate(
            () =>
                document
                    .getElementById(
                        "drawingToolMessage"
                    )
                    ?.innerText || ""
        );

    const armed = await msg();

    const canvasRef = (
        await ui.snapshot()
    ).match(/@e\d+ [^\n]*canvas[^\n]*/i)?.[0];

    if (!canvasRef) {
        return {
            error: "canvas not in snapshot",
            armed
        };
    }

    const ref = canvasRef.match(/@e\d+/)[0];

    /* The canvas is one box, so click positions come from a ref
       click at its centre. */
    await ui.click(ref);
    await page.waitForTimeout(400);

    const afterOne = await msg();

    await ui.click(ref);
    await page.waitForTimeout(400);

    const afterTwo = await msg();

    return {
        lineRef,
        armed,
        canvasRef,
        afterOne,
        afterTwo,
        panel: await page.evaluate(
            () =>
                document
                    .getElementById("drawingProperties")
                    ?.innerText?.slice(0, 200)
        )
    };
}
