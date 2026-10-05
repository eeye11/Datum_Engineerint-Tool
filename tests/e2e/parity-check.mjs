/*
 * FEATURE PARITY BETWEEN TWO BUILDS.
 *
 *   node tests/e2e/parity-check.mjs <originalUrl> <newUrl> [only-regex]
 *
 * Runs the same user workflows - through the real UI, as a student would -
 * against both builds, in fresh pages with pinned randomness, and compares
 * what each one produced. Where the golden scenario covers every tool's
 * creation, this covers the rest of the application: shortcuts, panel
 * edits, handles, box selection, the clipboard, the context menu, sheet
 * tabs, zoom and toggles, style controls, the colour picker, Save/Open/
 * Save As/Print/New, crash recovery, the written solution's references,
 * the image upload, dimensions and the analysis features.
 *
 * The native file pickers are replaced by fakes that capture what is
 * written and hand back files, so Save and Open run their real code paths.
 */
import { chromium } from "@playwright/test";

const [originalUrl, newUrl, only] = process.argv.slice(2);
const filter = only ? new RegExp(only) : null;

const INIT = () => {
    let seed = 7;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let n = 0;
    Object.defineProperty(crypto, "randomUUID", {
        value: () => { const h = (++n).toString(16).padStart(12, "0"); return `${h.slice(4)}-${h.slice(0, 4)}-4000-8000-${h}`; },
        configurable: true
    });
    if (!sessionStorage.getItem("keepStorage")) { try { localStorage.clear(); } catch {} }

    // Fake native file pickers: record what is saved, return files to open.
    window.__saved = [];
    window.__openFile = null;
    window.__printed = 0;
    window.__saveName = "drawing.enggdraw";
    window.showSaveFilePicker = async options => {
        const name = window.__saveName || options?.suggestedName || "file";
        return {
            name,
            async createWritable() {
                const parts = [];
                return {
                    async write(data) { parts.push(data); },
                    async close() {
                        const blob = new Blob(parts);
                        window.__saved.push({ name, type: blob.type, size: blob.size, text: name.endsWith(".enggdraw") ? await blob.text() : null });
                    }
                };
            },
            async getFile() { return new File([], name); }
        };
    };
    window.showOpenFilePicker = async () => [{ name: "drawing.enggdraw", async getFile() { return new File([window.__openFile || ""], "drawing.enggdraw", { type: "application/json" }); } }];
    window.print = () => { window.__printed++; };
    // Print writes the drawing into a new window and prints that window.
    window.open = () => {
        let html = "";
        const fake = {
            document: { write: s => { html += s; }, close() {}, open() {} },
            print: () => { window.__printed++; window.__printedHtml = html; },
            focus() {}, close() {}, addEventListener(type, fn) { if (type === "load") setTimeout(fn, 60); }, onload: null
        };
        setTimeout(() => { window.__printedHtml = html; if (typeof fake.onload === "function") fake.onload(); }, 50);
        return fake;
    };
    window.confirm = () => true;
    window.alert = () => {};
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- helpers usable by every check ---------- */
function helpers(page) {
    const h = {};
    h.canvasBox = () => page.evaluate(() => document.querySelector(".drawing-canvas").getBoundingClientRect().toJSON());
    h.at = async (fx, fy) => { const r = await h.canvasBox(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; };
    h.click = async (fx, fy, opts = {}) => {
        const p = await h.at(fx, fy);
        await page.mouse.move(p.x - 4, p.y - 4);
        await page.mouse.move(p.x, p.y, { steps: 3 });
        await sleep(60);
        await page.mouse.click(p.x, p.y, opts);
        await sleep(180);
    };
    h.drawingTab = async () => { await page.click("text=Engineering Drawing"); await sleep(150); };
    h.category = async c => { await page.click(`.drawing-category[data-category="${c}"]`); await sleep(80); };
    h.tool = async (id, sub) => {
        await page.click(`.drawing-tool[data-tool-id="${id}"]`);
        await sleep(120);
        if (sub) { await page.click(`[data-submenu-id="${sub}"]`); await sleep(120); }
    };
    h.sizing = async value => {
        if (await page.evaluate(() => !!document.querySelector(".drawing-creation-dimension"))) {
            await page.keyboard.type(String(value));
            await page.keyboard.press("Enter");
            await sleep(150);
        }
    };
    h.escape = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(40); } };
    h.beam = async (a = [0.3, 0.6], b = [0.7, 0.6]) => {
        await h.category("STATICS"); await h.tool("body", "beam");
        await h.click(...a); await h.click(...b); await h.sizing(100); await h.escape();
    };
    h.line = async (a = [0.3, 0.4], b = [0.6, 0.4], length = 80) => {
        await h.category("GEOMETRY"); await h.tool("line");
        await h.click(...a); await h.click(...b); await h.sizing(length); await h.escape();
    };
    h.state = () => page.evaluate(() => {
        const s = window.enggDrawing.state;
        return {
            objects: s.objects.map(o => ({ type: o.type, name: o.name, geometry: o.geometry, style: o.style, parent: Boolean(o.parentId) })),
            selected: s.selection.selectedObjectIds.length,
            tool: s.activeTool,
            camera: s.camera
        };
    });
    h.types = async () => (await h.state()).objects.map(o => o.type);
    h.selectFirst = type => page.evaluate(t => {
        const s = window.enggDrawing.state;
        const o = s.objects.find(x => x.type === t);
        if (o) window.enggDrawing.model.selectObjects(s, [o.id]);
        return Boolean(o);
    }, type);
    h.openPanelFor = async type => {
        await h.escape();
        const row = page.locator(".drawing-component-row", { hasText: new RegExp(type, "i") }).first();
        if (await row.count()) { await row.click(); await sleep(200); }
    };
    h.panelText = () => page.evaluate(() => document.getElementById("drawingProperties").innerText.replace(/\s+/g, " ").trim());
    h.message = () => page.evaluate(() => document.getElementById("drawingToolMessage")?.textContent.trim());
    return h;
}

/* ---------- the workflows ---------- */
const CHECKS = {
    "toolbar: every toolset's tools and submenus": async (page, h) => {
        await h.drawingTab();
        const out = {};
        for (const c of await page.$$eval(".drawing-category", b => b.map(x => x.dataset.category))) {
            await h.category(c);
            const tools = await page.$$eval(".drawing-tool[data-tool-id]", b => b.map(x => x.dataset.toolId));
            const withSubs = [];
            for (const t of tools) {
                await page.click(`.drawing-tool[data-tool-id="${t}"]`);
                await sleep(80);
                const subs = await page.$$eval(".drawing-coordinate-submenu-item", b => b.filter(x => x.offsetParent).map(x => x.dataset.submenuId || x.textContent.trim()));
                withSubs.push(subs.length ? `${t}[${subs.join(",")}]` : t);
                await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
            }
            out[c] = withSubs;
        }
        return out;
    },

    "keyboard: tool shortcuts and Escape": async (page, h) => {
        await h.drawingTab();
        await page.click(".header");
        const out = [];
        for (const key of ["l", "t", "r", "c", "p", "g", "Escape"]) {
            await page.keyboard.press(key); await sleep(80);
            out.push(`${key}->${(await h.state()).tool}`);
        }
        return out;
    },

    "line: drawn with a typed length": async (page, h) => {
        await h.drawingTab(); await h.line([0.3, 0.4], [0.6, 0.4], 80);
        return h.state();
    },

    "panel: a beam's Length edited in the Features panel": async (page, h) => {
        await h.drawingTab(); await h.beam();
        // The first click on a feature picks it in the tree; the second opens its properties.
        await h.tool("select"); await h.click(0.5, 0.6); await h.click(0.5, 0.6);
        const before = await h.panelText();
        const input = page.locator('#drawingProperties input[data-property="length"]').first();
        const found = await input.count();
        if (found) { await input.fill("150"); await input.press("Enter"); await sleep(250); }
        return { found, panel: before.slice(0, 400), after: (await h.state()).objects.map(o => o.geometry) };
    },

    "handles: dragging a beam's end": async (page, h) => {
        await h.drawingTab(); await h.beam();
        await h.selectFirst("beam");
        await page.evaluate(() => window.enggDrawing.renderer && document.dispatchEvent(new Event("noop")));
        const end = await h.at(0.7, 0.6), to = await h.at(0.75, 0.5);
        await h.category("STATICS"); await h.tool("select"); await h.selectFirst("beam");
        await page.mouse.move(end.x, end.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up(); await sleep(200);
        return (await h.state()).objects.map(o => o.geometry);
    },

    "selection: box select": async (page, h) => {
        await h.drawingTab(); await h.line([0.3, 0.3], [0.4, 0.3], 30); await h.line([0.6, 0.7], [0.7, 0.7], 30);
        await h.tool("select");
        const a = await h.at(0.2, 0.2), b = await h.at(0.5, 0.45);
        await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); await sleep(200);
        return { selected: (await h.state()).selected };
    },

    "clipboard: copy, paste, cut": async (page, h) => {
        await h.drawingTab(); await h.beam(); await h.selectFirst("beam");
        const out = [];
        await page.keyboard.press("Control+c"); await page.keyboard.press("Control+v"); await sleep(150); out.push((await h.types()).join(","));
        await page.keyboard.press("Control+v"); await sleep(150); out.push((await h.types()).join(","));
        await h.selectFirst("beam"); await page.keyboard.press("Control+x"); await sleep(150); out.push((await h.types()).join(","));
        return out;
    },

    "delete: a beam takes its support with it": async (page, h) => {
        await h.drawingTab(); await h.beam();
        await h.tool("support", "pin-support"); await h.click(0.5, 0.6); await h.click(0.3, 0.6); await h.escape();
        const before = await h.types();
        await h.selectFirst("beam"); await page.keyboard.press("Delete"); await sleep(150);
        return { before, after: await h.types() };
    },

    "history: undo and redo by keyboard and buttons": async (page, h) => {
        await h.drawingTab(); await h.category("GEOMETRY"); await h.tool("point");
        await h.click(0.3, 0.3); await h.click(0.4, 0.3); await h.click(0.5, 0.3); await h.escape();
        const out = [(await h.types()).length];
        await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z"); await sleep(100); out.push((await h.types()).length);
        await page.keyboard.press("Control+y"); await sleep(100); out.push((await h.types()).length);
        await page.click("#drawingUndo"); await sleep(100); out.push((await h.types()).length);
        await page.click("#drawingRedo"); await sleep(100); out.push((await h.types()).length);
        return out;
    },

    "context menu: right-click a feature": async (page, h) => {
        await h.drawingTab(); await h.beam(); await h.tool("select");
        const p = await h.at(0.5, 0.6);
        await page.mouse.click(p.x, p.y, { button: "right" }); await sleep(200);
        return page.$$eval(".drawing-context-menu button, .drawing-context-menu [role=menuitem]", b => b.map(x => x.textContent.trim()));
    },

    "sheets: add, switch, rename, delete through the tab bar": async (page, h) => {
        await h.drawingTab(); await h.line();
        const tabs = () => page.$$eval("#drawingSheetTabs .drawing-sheet-tab", t => t.map(x => x.textContent.replace(/\s+/g, " ").trim() + (x.classList.contains("active") ? "*" : "")));
        const out = { start: await tabs() };
        await page.click(".drawing-sheet-add"); await sleep(200);
        out.added = await tabs(); out.addedObjects = (await h.types()).length;
        await page.locator("#drawingSheetTabs .drawing-sheet-tab").first().click(); await sleep(200);
        out.switchedBack = { tabs: await tabs(), objects: (await h.types()).length };
        await page.locator("#drawingSheetTabs .drawing-sheet-tab").nth(1).click({ button: "right" }); await sleep(200);
        out.menu = await page.$$eval(".drawing-sheet-menu button", b => b.map(x => x.textContent.trim()));
        const rename = page.locator(".drawing-sheet-menu button", { hasText: /rename/i }).first();
        if (await rename.count()) {
            await rename.click(); await sleep(150);
            const field = page.locator(".engg-dialog input").first();
            if (await field.count()) { await field.fill("Free body diagram"); await page.keyboard.press("Enter"); await sleep(150); }
        }
        out.renamed = await tabs();
        await page.locator("#drawingSheetTabs .drawing-sheet-tab").nth(1).click({ button: "right" }); await sleep(150);
        const del = page.locator(".drawing-sheet-menu button", { hasText: /delete/i }).first();
        if (await del.count()) { await del.click(); await sleep(150); const ok = page.locator(".engg-dialog button", { hasText: /delete/i }).first(); if (await ok.count()) await ok.click(); await sleep(150); }
        out.deleted = await tabs();
        return out;
    },

    "view: zoom buttons, typed zoom, wheel, fit": async (page, h) => {
        await h.drawingTab(); await h.line();
        const zoom = async () => ({ value: await page.inputValue("#drawingZoomValue"), camera: (await h.state()).camera });
        const out = [await zoom()];
        await page.click("#drawingZoomIn"); await sleep(100); out.push(await zoom());
        await page.click("#drawingZoomOut"); await page.click("#drawingZoomOut"); await sleep(100); out.push(await zoom());
        await page.fill("#drawingZoomValue", "250"); await page.press("#drawingZoomValue", "Enter"); await sleep(100); out.push(await zoom());
        const c = await h.at(0.5, 0.5); await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, -200); await sleep(150); out.push(await zoom());
        await page.click('[data-global-tool="fit"]'); await sleep(150); out.push(await zoom());
        return out;
    },

    "view: grid, snap, dimension and magnitude toggles": async (page, h) => {
        await h.drawingTab();
        const read = () => page.evaluate(() => ["drawingGridToggle", "drawingSnapToggle", "drawingDimensionsToggle", "drawingMagnitudesToggle"].map(id => {
            const b = document.getElementById(id); return `${id}:${b?.textContent.trim()}:${b?.getAttribute("aria-pressed")}`;
        }).concat([`grid:${window.enggDrawing.state.grid.visible}`, `snap:${window.enggDrawing.state.snap.enabled}`]));
        const out = [await read()];
        for (const id of ["drawingGridToggle", "drawingSnapToggle", "drawingDimensionsToggle", "drawingMagnitudesToggle"]) { await page.click(`#${id}`); await sleep(80); }
        out.push(await read());
        return out;
    },

    "layout: collapsing the side panels": async (page, h) => {
        await h.drawingTab();
        const read = () => page.evaluate(() => [...document.querySelectorAll("#drawingToolPanel, #drawingFeaturesPanel")].map(e => `${e.id}:${e.className}:${Math.round(e.getBoundingClientRect().width)}`));
        const out = [await read()];
        await page.click("#drawingToolPanelToggle"); await page.click("#drawingFeaturesPanelToggle"); await sleep(250);
        out.push(await read());
        await page.click("#drawingToolPanelToggle"); await page.click("#drawingFeaturesPanelToggle"); await sleep(250);
        out.push(await read());
        return out;
    },

    "style: thickness and line type apply to new features": async (page, h) => {
        await h.drawingTab();
        const thickness = await page.$$eval("#drawingThickness option", o => o.map(x => x.value));
        const lineTypes = await page.$$eval("#drawingLineType option", o => o.map(x => x.value));
        await page.selectOption("#drawingThickness", thickness[thickness.length - 1]);
        await page.selectOption("#drawingLineType", lineTypes[lineTypes.length - 1]);
        await h.line();
        return { thickness, lineTypes, style: (await h.state()).objects[0]?.style };
    },

    "style: the colour picker": async (page, h) => {
        await h.drawingTab();
        await page.click(".drawing-colour-swatch"); await sleep(250);
        const cells = await page.locator(".drawing-colour-popup .drawing-colour-cell").count();
        if (cells) { await page.locator(".drawing-colour-popup .drawing-colour-cell").nth(5).click(); await sleep(150); }
        await page.keyboard.press("Escape");
        await h.line();
        return { cells, stroke: (await h.state()).objects[0]?.style?.stroke };
    },

    "file: Save, New, Open round-trip": async (page, h) => {
        await h.drawingTab(); await h.beam(); await h.line([0.3, 0.3], [0.5, 0.3], 60);
        const drawn = (await h.state()).objects.map(o => ({ type: o.type, geometry: o.geometry }));
        await page.click('[data-file-action="save"]'); await sleep(500);
        const saved = await page.evaluate(() => window.__saved.map(s => s.text));
        const text = saved[0] || "";
        await page.click('[data-file-action="new"]'); await sleep(300);
        const afterNew = await h.types();

        // Open straight after New: record what the student is asked.
        page.once("filechooser", c => c.setFiles({ name: "drawing.enggdraw", mimeType: "application/json", buffer: Buffer.from(text) }).catch(() => {}));
        await page.evaluate(t => { window.__openFile = t; }, text);
        await page.click('[data-file-action="open"]'); await sleep(900);
        const openAfterNew = {
            dialogs: await page.evaluate(() => [...document.querySelectorAll(".engg-dialog")].filter(d => d.getClientRects().length).map(d => d.innerText.replace(/\s+/g, " ").slice(0, 120))),
            types: await h.types()
        };

        // Open into a fresh page: the saved file must bring back the drawing exactly.
        await page.reload(); await sleep(600);
        await page.evaluate(t => { window.__openFile = t; }, text);
        await h.drawingTab();
        page.once("filechooser", c => c.setFiles({ name: "drawing.enggdraw", mimeType: "application/json", buffer: Buffer.from(text) }).catch(() => {}));
        await page.click('[data-file-action="open"]'); await sleep(900);
        const reopened = (await h.state()).objects.map(o => ({ type: o.type, geometry: o.geometry }));
        const body = text ? JSON.parse(text) : null;
        return {
            file: { format: body?.format, version: body?.version, sheets: body?.document?.sheets?.length },
            afterNew,
            openAfterNew,
            reopened,
            restoredExactly: JSON.stringify(reopened) === JSON.stringify(drawn)
        };
    },
    "file: Save As PNG and JPG, and Print": async (page, h) => {
        await h.drawingTab(); await h.beam();
        const out = {};
        for (const name of ["drawing.png", "drawing.jpg"]) {
            await page.evaluate(n => { window.__saveName = n; window.__saved = []; }, name);
            await page.click('[data-file-action="save-as"]'); await sleep(200);
            const choice = page.locator(".engg-dialog button, .engg-dialog [role=option]", { hasText: new RegExp(name.split(".")[1], "i") }).first();
            if (await choice.count()) { await choice.click(); await sleep(150); }
            // Image encoding is asynchronous: wait for the file, up to 8 s.
            await page.waitForFunction(() => window.__saved.length > 0, null, { timeout: 8000 }).catch(() => {});
            out[name] = await page.evaluate(() => window.__saved.map(s => ({ name: s.name, nonEmpty: s.size > 1000 })));
            await h.escape();
        }
        await page.click('[data-file-action="print"]'); await sleep(800);
        out.printed = await page.evaluate(() => ({ calls: window.__printed, printsTheDrawing: /<img src="data:image\/png/.test(window.__printedHtml || "") }));
        return out;
    },

    "recovery: unsaved work survives a reload": async (page, h) => {
        await h.drawingTab(); await h.beam(); await h.line();
        await sleep(2500);
        await page.evaluate(() => sessionStorage.setItem("keepStorage", "1"));
        await page.reload(); await sleep(800);
        const prompt = await page.evaluate(() => [...document.querySelectorAll(".engg-dialog")].map(d => d.innerText.replace(/\s+/g, " ").slice(0, 160)));
        const accept = page.locator(".engg-dialog button", { hasText: /recover|restore/i }).first();
        if (await accept.count()) { await accept.click(); await sleep(400); }
        return { prompt, restored: await h.types() };
    },

    "solution: insert a drawing reference and render it": async (page, h) => {
        await h.drawingTab(); await h.beam();
        await page.click("text=Written Solution"); await sleep(200);
        await page.fill("#writingCode", "The beam: ");
        await page.click("#referenceInsert"); await sleep(300);
        await page.click("[data-action='render-solution'], .update-button >> nth=0"); await sleep(1500);
        return page.evaluate(() => ({
            code: document.getElementById("writingCode").value.replace(/sheet_[0-9a-f]+/g, "sheet_#"),
            figures: document.querySelectorAll("#writingOutput svg").length,
            text: document.getElementById("writingOutput").innerText.replace(/\s+/g, " ").slice(0, 120)
        }));
    },

    "solution: uploading a handwritten page": async (page, h) => {
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
        await page.setInputFiles("#writingImageUpload", { name: "page.png", mimeType: "image/png", buffer: png }); await sleep(300);
        return page.evaluate(() => ({ image: getComputedStyle(document.getElementById("writingImage")).display, message: getComputedStyle(document.getElementById("writingImageMessage")).display }));
    },

    "dimensions: dimension a beam, calibrate the scale": async (page, h) => {
        await h.drawingTab(); await h.beam();
        await h.category("ANNOTATE"); await h.tool("dimension");
        await h.click(0.5, 0.6); await page.keyboard.press("Enter"); await sleep(150); await h.click(0.5, 0.5); await sleep(300);
        const dialog = await page.evaluate(() => [...document.querySelectorAll(".engg-dialog, .drawing-creation-dimension, [role=dialog]")].filter(e => e.getClientRects().length).map(d => d.innerText.replace(/\s+/g, " ").slice(0, 160)));
        await h.escape();
        const s = await h.state();
        return { dialog, types: s.objects.map(o => o.type), message: await h.message() };
    },

    "analysis: resultant and force components": async (page, h) => {
        await h.drawingTab(); await h.beam();
        await h.tool("point-force"); await h.click(0.4, 0.6); await h.click(0.42, 0.45); await h.sizing(100); await h.escape();
        await h.tool("point-force"); await h.click(0.55, 0.6); await h.click(0.6, 0.48); await h.sizing(100); await h.escape();
        page.evaluate(() => { const s = window.enggDrawing.state; window.enggDrawing.model.selectObjects(s, s.objects.filter(o => o.type === "force").map(o => o.id)); });
        await h.tool("resultant"); await h.click(0.5, 0.3); await sleep(200); await h.escape();
        await h.selectFirst("force"); await h.tool("force-components"); await h.click(0.4, 0.3); await sleep(200); await h.escape();
        return { types: await h.types(), message: await h.message() };
    }
};

/* ---------- run ---------- */
function normalise(value) {
    return JSON.parse(JSON.stringify(value ?? null)
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}/g, "#id")
        .replace(/sheet_[0-9a-f]{8}/g, "sheet_#")
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "#time"));
}

async function run(url, name) {
    const browser = await chromium.launch({ channel: "chrome" });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await context.addInitScript(INIT);
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    const errors = [];
    page.on("pageerror", e => { if (!/MathJax is not defined/.test(e.message)) errors.push(e.message.slice(0, 160)); });
    let result;
    try {
        await page.goto(url);
        await sleep(500);
        result = { value: normalise(await CHECKS[name](page, helpers(page))) };
    } catch (error) {
        result = { failed: String(error.message).split("\n")[0].slice(0, 200) };
    }
    result.errors = errors;
    await browser.close();
    return result;
}

let same = 0;
const report = [];
const observed = {};
for (const name of Object.keys(CHECKS)) {
    if (filter && !filter.test(name)) continue;
    const [a, b] = [await run(originalUrl, name), await run(newUrl, name)];
    observed[name] = b;
    const identical = JSON.stringify(a) === JSON.stringify(b);
    if (identical) same++;
    const status = identical ? "same" : "DIFF";
    console.log(`${status}  ${name}${a.failed ? `   (original could not run it: ${a.failed})` : ""}${b.failed ? `   (new could not run it: ${b.failed})` : ""}`);
    if (a.errors.length || b.errors.length) console.log(`        page errors - original: ${JSON.stringify(a.errors)}  new: ${JSON.stringify(b.errors)}`);
    if (!identical) report.push({ name, original: a, new: b });
}
console.log(`\n${same}/${same + report.length} workflows identical`);
// PARITY_DUMP=file.json writes what each workflow observed on the new build.
if (process.env.PARITY_DUMP) (await import("fs")).writeFileSync(process.env.PARITY_DUMP, JSON.stringify(observed, null, 1));
for (const r of report) {
    console.log(`\n--- ${r.name}\n  original: ${JSON.stringify(r.original).slice(0, 900)}\n  new:      ${JSON.stringify(r.new).slice(0, 900)}`);
}
