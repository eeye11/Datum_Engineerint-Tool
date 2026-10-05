/*
 * Reports whether the drawing scripts are present, and what happens
 * when one is evaluated. Verification aid.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
        const scripts = Array.from(document.scripts).map(
            (s) => s.src.split("/").pop()
        );

        const drawing = scripts.includes("drawing.js");

        /*
         * What the module-scoped lookups resolved to. If drawing.js
         * ran, these are globals; if it threw partway, they are not.
         */
        const globals = {
            sheets: typeof window.enggDrawingSheets,
            state: typeof window.enggDrawingState,
            renderer: typeof window.enggDrawingRenderer,
            export: typeof window.enggDrawingExport,
            tools: typeof window.enggDrawingTools
        };

        /*
         * Did the canvas get its SVG at all? A drawn feature would
         * need one, and its absence says the app never initialised.
         */
        const canvas = document.querySelector(
            ".drawing-canvas"
        );

        return {
            scriptCount: scripts.length,
            hasDrawingScript: drawing,
            drawingScripts: scripts.filter((s) =>
                /drawing|state|renderer|snap/.test(s)
            ),
            globals,
            canvasHasSvg: Boolean(canvas?.querySelector("svg")),
            toolButtons: document.querySelectorAll(
                "[data-tool-id]"
            ).length
        };
    });
}
