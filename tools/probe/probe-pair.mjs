export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  const b = await page.locator(".drawing-workspace").first().boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(300);

  const stroke = async (x1, y1, x2, y2) => {
    await page.mouse.click(cx + x1, cy + y1);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + x2, cy + y2);
    await page.waitForTimeout(600);
  };

  await stroke(-220, -120, 0, 0);
  await stroke(-220, 120, 0, 0);

  await page.locator('#drawingToolList [data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.move(cx - 300, cy - 190);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 190, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const st = window.enggDrawing.state;
      const S = window.enggSmartDimension, M = window.enggMeasurement;
      const ids = st.selection.selectedObjectIds;
      const [a, b] = ids.map(id => st.objects.find(o => o.id === id));
      const R = { count: ids.length, types: [a && a.type, b && b.type] };
      try { R.spanA = M.twoPointSpan(a); } catch(e){ R.spanA='ERR '+e.message; }
      try { R.spanB = M.twoPointSpan(b); } catch(e){ R.spanB='ERR '+e.message; }
      try { R.pairCands = S.pairCandidates(a, b); } catch(e){ R.pairCands='ERR '+e.message; }
      try { R.measurePairCands = M.pairCandidates(a, b); } catch(e){ R.measurePairCands='ERR '+e.message; }
      try { R.pairDescFor = S.pairDescriptorFor(a, b, 'angular', st); } catch(e){ R.pairDescFor='ERR '+e.message; }
      try { R.describePair = S.describePair(a, b, st); } catch(e){ R.describePair='ERR '+e.message; }
      try { R.alreadyStated = S.alreadyStated ? S.alreadyStated({dimensionType:'angular',refs:[{kind:'between',featureId:a.id,anchor:'start'}]}, st) : 'n/a'; } catch(e){ R.alreadyStated='ERR '+e.message; }
      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(400);
  return { raw: await page.getAttribute("html", "data-res") };
}
