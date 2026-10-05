export default async function run(page) {
  const errors = [];

  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  // A page of our own, so the question "does JS execute here at all?" is
  // separated from anything about EnggDraw.
  await page.goto("data:text/html,<h1>hi</h1>", { waitUntil: "load" });
  await page.waitForTimeout(300);

  const minimal = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__x = 41 + 1;";
    document.body.appendChild(s);

    return typeof window.__x;
  });

  // Now the real page.
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const app = await page.evaluate(() => ({
    plotEditor: typeof window.enggPlotEditor,
    equations: typeof window.enggDiagramEquations,
    showTab: typeof window.showTab,
  }));

  return { minimal, app, errors };
}
