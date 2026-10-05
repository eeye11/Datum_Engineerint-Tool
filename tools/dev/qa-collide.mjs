/*
 * Reports what the drawing scripts actually produced, by evaluating
 * them in a fresh scope where collisions are visible. Verification aid.
 */
export default async function run(page, ui) {
    await page.goto("http://localhost:8931/index.html", {
        waitUntil: "load"
    });
    await page.waitForTimeout(1500);

    return await page.evaluate(async () => {
        /*
         * Load every engineering-drawing module into ONE function scope,
         * so a top-level `const` that collides with another module's
         * shows up as a real SyntaxError instead of silently breaking
         * the global.
         */
        const scripts = [
            "tools.js",
            "drawing-state.js",
            "renderer.js",
            "object-snap.js",
            "dimension-editor.js",
            "drawing-reference.js",
            "document-export.js",
            "load-profile.js",
            "feature-geometry.js",
            "ui.js",
            "drawing.js",
            "written-references.js"
        ];

        const bodies = [];

        for (const s of scripts) {
            const res = await fetch(
                "/js/engineering-drawing/" + s
            );
            bodies.push(await res.text());
        }

        const combined = bodies.join("\n;\n");

        let error = null;

        try {
            /* Parsed but NOT run: this is what finds collisions. */
            new Function(combined);
        } catch (e) {
            error = {
                message: e.message,
                line: e.lineNumber ?? null
            };
        }

        /* The identifiers each module declares, for inspection. */
        const declared = [
            ...combined.matchAll(
                /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm
            )
        ].map((m) => m[1]);

        const seen = new Map();
        const dupes = [];

        declared.forEach((name) => {
            seen.set(name, (seen.get(name) || 0) + 1);
        });

        seen.forEach((n, c) => {
            if (c > 1) dupes.push({ name: n, count: c });
        });

        return {
            scriptCount: scripts.length,
            totalLength: combined.length,
            parseError: error,
            duplicateTopLevel: dupes
        };
    });
}
