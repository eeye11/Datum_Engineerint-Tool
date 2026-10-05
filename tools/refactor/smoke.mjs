// Loads the page, opens the drawing tab, draws a line, and reports any errors.
import { chromium } from "@playwright/test";
const url = process.argv[2] || "http://localhost:8125/";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", r => errors.push("requestfailed: " + r.url()));
page.on("response", r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
await page.goto(url);
await page.waitForTimeout(800);
await page.click("text=Engineering Drawing");
await page.click('.drawing-tool[data-tool-id="line"]');
const r = await page.evaluate(() => document.querySelector(".drawing-canvas").getBoundingClientRect().toJSON());
for (const f of [0.3, 0.6]) { await page.mouse.move(r.left + r.width * f, r.top + r.height / 2); await page.mouse.click(r.left + r.width * f, r.top + r.height / 2); await page.waitForTimeout(200); }
const state = await page.evaluate(() => ({ objects: window.enggDrawing?.state.objects.length, tools: document.querySelectorAll(".drawing-tool").length }));
console.log(JSON.stringify(state));
console.log(errors.join("\n") || "no errors");
await browser.close();
