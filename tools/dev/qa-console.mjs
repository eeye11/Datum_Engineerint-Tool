/*
 * Reports any load failure preventing the drawing scripts from
 * running, and the state of the reference controls. Verification aid.
 */
export default async function run(page, ui) {
    const errors = [];

    page.on("console", (m) => {
        if (m.type() === "error") {
            errors.push(m.text().slice(0, 300));
        }
    });

    page.on("pageerror", (e) =>
        errors.push("pageerror: " + e.message.slice(0, 300))
    );

    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2500);

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(1500);
    }

    const state = await page.evaluate(() => ({
        sheets: typeof window.enggDrawingSheets,
        reference: typeof window.enggDrawingReference,
        written: typeof window.enggWrittenReferences,
        tools: document.querySelectorAll("[data-tool-id]")
            .length,
        code: Boolean(document.getElementById("writingCode")),
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

    return { errors, state };
}
