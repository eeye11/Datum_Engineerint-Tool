export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  return await page
    .evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `
    (function(){
      const st = window.enggDrawing.state;
      const M = window.enggMeasurement;
      const A = window.enggAnnotationModel;
      const R = {};

      ['force','moment','load','couple','pin-support','beam','line'].forEach(t => {
        const o = st.objects.find(x => x.type === t);
        if (!o) { R[t] = 'not on sheet'; return; }
        R[t] = {
          geometry: o.geometry,
          anchorNames: M.anchorNames ? M.anchorNames(o) : 'n/a',
          anchorOptions: M.anchorOptions(o),
          resolved: (M.anchorOptions(o)||[]).map(n => {
            const p = M.resolveAnchor(o, n);
            return n + '=' + (p ? Math.round(p.x) + ',' + Math.round(p.y) : 'null');
          }),
          kinds: A.kindsFor(o, st)
        };
      });

      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
      document.body.appendChild(s);
      return null;
    })
    .then(() => page.getAttribute("html", "data-res"))
    .then((v) => JSON.parse(v || "null"));
}
