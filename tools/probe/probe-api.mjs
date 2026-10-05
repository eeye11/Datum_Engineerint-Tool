export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
      window.__api = {
        M: window.enggMeasurement ? Object.keys(window.enggMeasurement).sort() : null,
        D: window.enggDimensionModel ? Object.keys(window.enggDimensionModel).sort() : null,
        A: window.enggAnnotationModel ? Object.keys(window.enggAnnotationModel).sort() : null,
        S: window.enggSmartDimension ? Object.keys(window.enggSmartDimension).sort() : null,
        Scale: window.enggDimensions ? Object.keys(window.enggDimensions).sort() : null
      };
      document.documentElement.setAttribute('data-api', JSON.stringify(window.__api));
    `;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(300);
  const raw = await page.getAttribute("html", "data-api");
  const a = JSON.parse(raw);
  return {
    measurement: a.M,
    dimensionModel: a.D,
    annotationModel: a.A,
    smartDimension: a.S,
    scale: a.Scale,
  };
}
