export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const S = window.enggSmartDimension, M = window.enggMeasurement;
      const R = {};
      const rect = { id:'r', type:'rectangle', geometry:{x1:0,y1:0,x2:80,y2:40} };
      const rect2 = { id:'r2', type:'rectangle', geometry:{start:{x:0,y:0},width:80,height:40} };
      try { R.cands_rect_x1 = S.candidatesFor(rect); } catch(e){ R.cands_rect_x1 = 'ERR '+e.message; }
      try { R.cands_rect_sw = S.candidatesFor(rect2); } catch(e){ R.cands_rect_sw = 'ERR '+e.message; }
      try { R.dc_rect = M.dimensionCandidates(rect); } catch(e){ R.dc_rect = 'ERR '+e.message; }
      try { R.anchors = M.anchorOptions(rect); } catch(e){ R.anchors = 'ERR '+e.message; }
      try { R.desc = S.descriptorFor(rect,'horizontal',{scale:{mmPerUnit:1,unit:'mm'},objects:[rect]}); } catch(e){ R.desc='ERR '+e.message; }
      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(300);
  return JSON.parse(await page.getAttribute("html", "data-res"));
}
