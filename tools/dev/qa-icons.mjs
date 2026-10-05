/*
 * Renders the five Analysis icons large so they can be looked at as
 * artwork, rather than trusted because they were typed. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", {
        timeout: 20000
    });

    await page
        .waitForFunction(
            () =>
                typeof window.enggDrawingTools !==
                    "undefined",
            { timeout: 20000 }
        )
        .catch(() => null);

    return await page.evaluate(() => {
        const tools = window.enggDrawingTools;

        if (!tools) {
            return { error: "tools module not exposed" };
        }

        const icons = tools.icons ?? tools.toolIcons ?? null;

        if (!icons) {
            return {
                keys: Object.keys(tools)
            };
        }

        const wanted = [
            "Force Components",
            "Resultant",
            "Shear Force (SFD)",
            "Bending Moment (BMD)",
            "Axial Force (AFD)"
        ];

        return {
            found: wanted.map((name) => ({
                name,
                present: Boolean(icons[name]),
                distinct: new Set(
                    wanted.map((n) => icons[n])
                ).size
            }))
        };
    });
}
