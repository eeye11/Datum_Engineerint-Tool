/*
 * Locates the drawing globals wherever they actually live, so a
 * probe cannot report them missing just because it looked in the
 * wrong realm. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 20000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(1000);
    }

    return await page.evaluate(() => {
        const names = [
            "enggDrawingSheets",
            "enggDrawingReference",
            "enggDrawingState",
            "enggDrawingExport",
            "enggDrawing"
        ];

        const found = {};

        names.forEach((name) => {
            found[name] =
                typeof window[name] !== "undefined"
                    ? "window"
                    : typeof self?.[name] !== "undefined"
                      ? "self"
                      : typeof globalThis?.[name] !==
                          "undefined"
                        ? "globalThis"
                        : "NOT FOUND";
        });

        /* The drawings themselves are the real proof the module ran. */
        const rows = Array.from(
            document.querySelectorAll(
                ".drawing-component-row"
            )
        ).map((el) => el.innerText.trim());

        return {
            found,
            frames: window.frames.length,
            sameWindow: window === globalThis,
            rows: rows.slice(0, 8),
            inputEl: Boolean(
                document.getElementById("writingInput")
            ),
            inputByName: Boolean(
                document.querySelector(
                    "#writingInput, [id*=writing]"
                )
            )
        };
    });
}
