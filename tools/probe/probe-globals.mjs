export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  return await page.evaluate(() => ({
    typeofM: typeof window.enggMeasurement,
    typeofD: typeof window.enggDimensionModel,
    typeofTool: typeof window.enggTools,
    typeofDraw: typeof window.enggDrawing,
    sample: Object.keys(window)
      .filter((k) => /engg/i.test(k))
      .slice(0, 20),
  }));
}
