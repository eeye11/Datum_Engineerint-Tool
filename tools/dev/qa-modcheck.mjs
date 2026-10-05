/*
 * Loads each engineering-drawing module in the page and reports which
 * ones define their global, so a module that silently fails to run is
 * identifiable by name.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
        /*
         * Every module, and the global each one is expected to
         * publish. A module whose global is missing never ran to
         * completion - either it threw, or it was not reached.
         */
        const expected = [
            ["tools.js", "enggDrawingTools"],
            ["drawing-state.js", "enggDrawingState"],
            ["renderer.js", "enggDrawingRenderer"],
            ["object-snap.js", "enggDrawingSnap"],
            ["dimension-editor.js", "enggDimensionEditor"],
            ["drawing-reference.js", "enggDrawingReference"],
            ["document-export.js", "enggDrawingExport"],
            ["load-profile.js", "enggLoadProfile"],
            ["ui.js", "enggDrawingUI"],
            ["drawing.js", "enggDrawingSheets"],
            ["written-references.js", "enggWrittenReferences"]
        ];

        return {
            globals: expected.map(([file, name]) => ({
                file,
                global: name,
                defined: typeof window[name] !== "undefined"
            })),
            missing: expected
                .filter(
                    ([, name]) =>
                        typeof window[name] === "undefined"
                )
                .map(([file]) => file)
        };
    });
}
