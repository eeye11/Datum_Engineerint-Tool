export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  // Write the result into the DOM from page-main-world script tag,
  // so we read it the same way regardless of eval isolation.
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
      window.__probe = {
        M: typeof window.enggMeasurement,
        D: typeof window.enggDimensionModel,
        A: typeof window.enggAnnotationModel,
        S: typeof window.enggSmartDimension,
        Scales: typeof window.enggDimensions,
        Draw: typeof window.enggDrawing,
        Ui: typeof window.enggUi
      };
      document.documentElement.setAttribute('data-probe', JSON.stringify(window.__probe));
    `;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(500);
  return { attr: await page.getAttribute("html", "data-probe") };
}
