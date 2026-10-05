export default async function run(page) {
  const out = { steps: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.45 };
  });

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="point-force"]').click();
  });
  await page.waitForTimeout(450);

  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(450);
  await page.mouse.move(box.x + 120, box.y);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(900);

  // Longest drawn shaft = the force arrow length.
  const shaft = () =>
    page.evaluate(() => {
      const lengths = [...document.querySelectorAll(".drawing-renderer line")]
        .map((l) => {
          const x1 = Number(l.getAttribute("x1"));
          const x2 = Number(l.getAttribute("x2"));
          return Number.isFinite(x1) && Number.isFinite(x2)
            ? Math.abs(x2 - x1)
            : 0;
        })
        .filter((v) => v > 0);
      return lengths.length ? Math.max(...lengths) : null;
    });

  // Engineering values shown in the panel: the thing that must NOT change.
  const engineering = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#drawingProperties input")]
        .map((i) => i.value)
        .filter(Boolean),
    );

  const scaleSelects = () =>
    page.evaluate(() => {
      const s = [...document.querySelectorAll("[data-statics-vector-scale]")];
      return { count: s.length, value: s[0]?.value ?? null };
    });

  // Open the edit view: select, then click the selected row again.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".drawing-component-row")].find(
      (r) => /Point Force/i.test(r.textContent),
    );
    if (row) row.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".drawing-component-row")].find(
      (r) => /Point Force/i.test(r.textContent),
    );
    if (row) row.click();
  });
  await page.waitForTimeout(700);

  out.steps.push({
    step: "at 1.0x",
    shaft: await shaft(),
    engineering: await engineering(),
    scale: await scaleSelects(),
  });

  for (const value of ["2", "4", "0.5"]) {
    await page.evaluate((v) => {
      const sel = document.querySelector("[data-statics-vector-scale]");
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(800);

    out.steps.push({
      step: `at ${value}x`,
      shaft: await shaft(),
      engineering: await engineering(),
      scale: await scaleSelects(),
    });
  }

  return out;
}
